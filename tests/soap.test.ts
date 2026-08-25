import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";

/**
 * Phase 4 · Checkpoint 1 — SOAP records, versioning, diagnoses, diagnostics.
 *
 * The headline requirement is that a finalized SOAP record can never be
 * silently overwritten: editing one creates a new version, the old one is
 * retrievable, and only a doctor can write clinical content at all —
 * asserted through really signed-in database clients, the same way
 * tests/appointments.test.ts tests the equivalent guarantees there.
 */

const RUN = runId();

let orgA: string;
let clientA: SupabaseClient;
let doctorA: SupabaseClient;
let doctorA2: SupabaseClient;
let adminA: SupabaseClient;
let clientB: SupabaseClient;

let clientRecordA: string;
let doctorRecordA: string;
let petA: string;
let appointmentA: string;

async function insertAppointment(overrides: Record<string, unknown> = {}) {
  const { data: service } = await admin
    .from("services")
    .select("id, duration_minutes")
    .eq("organization_id", orgA)
    .eq("name", "General consultation")
    .single();

  const starts = new Date(Date.now() - 3_600_000 - Math.random() * 100_000_000);
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
      ...overrides,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  orgA = await organizationId();

  const [userA, userB, vetA, vetA2, adminUser] = await Promise.all([
    createUserWithRole(`soap-a-${RUN}`, "client"),
    createUserWithRole(`soap-b-${RUN}`, "client"),
    createUserWithRole(`soap-vet-${RUN}`, "doctor"),
    createUserWithRole(`soap-vet2-${RUN}`, "doctor"),
    createUserWithRole(`soap-admin-${RUN}`, "admin"),
  ]);

  const [{ data: clientRow }, { data: doctorRow }] = await Promise.all([
    admin
      .from("clients")
      .insert({ user_id: userA.userId, organization_id: orgA, full_name: `Soap Client A ${RUN}`, phone: `+88018${RUN}21` })
      .select("id")
      .single(),
    admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
  ]);
  await admin.from("doctors").insert({ user_id: vetA2.userId, organization_id: orgA });

  clientRecordA = clientRow!.id;
  doctorRecordA = doctorRow!.id;

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: pet } = await admin
    .from("pets")
    .insert({ client_id: clientRecordA, organization_id: orgA, name: `Soap Pet ${RUN}`, species_id: species!.id })
    .select("id")
    .single();
  petA = pet!.id;

  appointmentA = await insertAppointment();

  [clientA, doctorA, doctorA2, adminA, clientB] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(vetA.email),
    signedInClient(vetA2.email),
    signedInClient(adminUser.email),
    signedInClient(userB.email),
  ]);
}, 120_000);

describe("clinical authorship is doctor-only", () => {
  it("stops a client creating a SOAP record", async () => {
    const { error } = await clientA
      .from("soap_records")
      .insert({ appointment_id: appointmentA, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA });

    expect(error).not.toBeNull();
  });

  it("stops an admin creating a SOAP record", async () => {
    const { error } = await adminA
      .from("soap_records")
      .insert({ appointment_id: appointmentA, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA });

    expect(error).not.toBeNull();
  });

  it("lets a doctor create one", async () => {
    const { data, error } = await doctorA
      .from("soap_records")
      .insert({
        appointment_id: appointmentA,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        chief_complaint: "Lethargy",
      })
      .select("id, status, version");

    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({ status: "draft", version: 1 });
  });
});

describe("a client sees only the current finalized version", () => {
  it("cannot see the draft", async () => {
    const { data } = await clientA.from("soap_records").select("id").eq("appointment_id", appointmentA);
    expect(data).toEqual([]);
  });

  it("sees it once finalized", async () => {
    const { data: draft } = await admin
      .from("soap_records")
      .select("id")
      .eq("appointment_id", appointmentA)
      .is("superseded_at", null)
      .single();

    const { error } = await doctorA
      .from("soap_records")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", draft!.id);
    expect(error).toBeNull();

    const { data } = await clientA.from("soap_records").select("id, status").eq("appointment_id", appointmentA);
    expect(data).toEqual([{ id: draft!.id, status: "finalized" }]);
  });

  it("an admin can view it too, view-only — CLAUDE.md §3's clinical records row for admin", async () => {
    const { data: current } = await admin
      .from("soap_records")
      .select("id")
      .eq("appointment_id", appointmentA)
      .is("superseded_at", null)
      .single();

    const { data, error } = await adminA.from("soap_records").select("id, status").eq("appointment_id", appointmentA);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: current!.id, status: "finalized" }]);

    const { data: written, error: writeError } = await adminA
      .from("soap_records")
      .update({ chief_complaint: "Rewritten by an admin" })
      .eq("id", current!.id)
      .select("id");
    expect(writeError).toBeNull();
    expect(written).toEqual([]);
  });

  it("still cannot write to it", async () => {
    const { data: current } = await admin
      .from("soap_records")
      .select("id")
      .eq("appointment_id", appointmentA)
      .is("superseded_at", null)
      .single();

    const { data, error } = await clientA
      .from("soap_records")
      .update({ chief_complaint: "hacked" })
      .eq("id", current!.id)
      .select("id");

    // Doctor-only per soap_records_update — RLS silently matches no rows
    // for a client rather than raising, the same as every other table here.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("a finalized record is immutable except for being superseded", () => {
  it("refuses a direct edit of a clinical field", async () => {
    const { data: current } = await admin
      .from("soap_records")
      .select("id")
      .eq("appointment_id", appointmentA)
      .is("superseded_at", null)
      .single();

    const { error } = await doctorA
      .from("soap_records")
      .update({ clinical_assessment: "sneaky edit" })
      .eq("id", current!.id);

    expect(error).not.toBeNull();
  });

  it("revising creates a new version and supersedes the old one, both retrievable", async () => {
    const { data: current } = await admin
      .from("soap_records")
      .select("id, version")
      .eq("appointment_id", appointmentA)
      .is("superseded_at", null)
      .single();

    const { data: newId, error } = await doctorA.rpc("revise_soap_record", { p_soap_record_id: current!.id });
    expect(error).toBeNull();
    expect(newId).toBeTruthy();

    const { data: versions } = await admin
      .from("soap_records")
      .select("id, version, status, superseded_at")
      .eq("appointment_id", appointmentA)
      .order("version");

    expect(versions).toHaveLength(2);
    expect(versions?.[0]).toMatchObject({ id: current!.id, version: 1, status: "finalized" });
    expect(versions?.[0]?.superseded_at).not.toBeNull();
    expect(versions?.[1]).toMatchObject({ id: newId, version: 2, status: "draft", superseded_at: null });
  });

  it("a client sees nothing while the revision is still a draft, then the new version once finalized", async () => {
    const { data: whileDraft } = await clientA.from("soap_records").select("id").eq("appointment_id", appointmentA);
    expect(whileDraft).toEqual([]);

    const { data: draftRow } = await admin
      .from("soap_records")
      .select("id")
      .eq("appointment_id", appointmentA)
      .is("superseded_at", null)
      .single();

    await doctorA
      .from("soap_records")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", draftRow!.id);

    const { data: afterFinalize } = await clientA.from("soap_records").select("id, version").eq("appointment_id", appointmentA);
    expect(afterFinalize).toEqual([{ id: draftRow!.id, version: 2 }]);
  });

  it("any doctor at the practice may revise, not only the one who wrote it", async () => {
    const { data: current } = await admin
      .from("soap_records")
      .select("id")
      .eq("appointment_id", appointmentA)
      .is("superseded_at", null)
      .single();

    const { error } = await doctorA2.rpc("revise_soap_record", { p_soap_record_id: current!.id });
    expect(error).toBeNull();
  });
});

describe("cross-tenancy isolation", () => {
  it("stops client B seeing client A's SOAP records", async () => {
    const { data } = await clientB.from("soap_records").select("id").eq("appointment_id", appointmentA);
    expect(data).toEqual([]);
  });
});

describe("diagnoses and diagnostics", () => {
  it("stops a client recording a diagnosis", async () => {
    const { error } = await clientA
      .from("diagnoses")
      .insert({ appointment_id: appointmentA, pet_id: petA, organization_id: orgA, kind: "final", description: "hacked" });

    expect(error).not.toBeNull();
  });

  it("lets a doctor record one, tied to the appointment not one SOAP version", async () => {
    const { error } = await doctorA
      .from("diagnoses")
      .insert({ appointment_id: appointmentA, pet_id: petA, organization_id: orgA, kind: "final", description: "Anemia" });

    expect(error).toBeNull();
  });

  it("a client cannot see it until a finalized SOAP record exists for that visit", async () => {
    const secondAppointment = await insertAppointment();
    await doctorA
      .from("diagnoses")
      .insert({ appointment_id: secondAppointment, pet_id: petA, organization_id: orgA, kind: "differential", description: "Suspected tick fever" });

    const { data: beforeFinalized } = await clientA.from("diagnoses").select("id").eq("appointment_id", secondAppointment);
    expect(beforeFinalized).toEqual([]);

    await doctorA.from("soap_records").insert({
      appointment_id: secondAppointment,
      pet_id: petA,
      organization_id: orgA,
      doctor_id: doctorRecordA,
      chief_complaint: "Fever",
      clinical_assessment: "Suspected tick fever",
      status: "finalized",
      finalized_at: new Date().toISOString(),
    });

    const { data: afterFinalized } = await clientA.from("diagnoses").select("id").eq("appointment_id", secondAppointment);
    expect(afterFinalized).toHaveLength(1);
  });

  it("lets a doctor order a diagnostic test and stops a client ordering one", async () => {
    const { error: doctorError } = await doctorA
      .from("diagnostics")
      .insert({ appointment_id: appointmentA, pet_id: petA, organization_id: orgA, test_name: "CBC panel" });
    expect(doctorError).toBeNull();

    const { error: clientError } = await clientA
      .from("diagnostics")
      .insert({ appointment_id: appointmentA, pet_id: petA, organization_id: orgA, test_name: "hacked" });
    expect(clientError).not.toBeNull();
  });
});

describe("audit trail", () => {
  it("records SOAP creation and finalization", async () => {
    const { data: soapLogs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_table", "soap_records")
      .in("action", ["soap_records.insert", "soap_records.update"]);

    expect((soapLogs ?? []).some((row) => row.action === "soap_records.insert")).toBe(true);
    expect((soapLogs ?? []).some((row) => row.action === "soap_records.update")).toBe(true);
  });
});

describe("documents carry a clinical type", () => {
  it("defaults to other and accepts the allowed values", async () => {
    const { data: uploader } = await admin.from("users").select("id").limit(1).single();

    const { data: withDefault, error: defaultError } = await admin
      .from("documents")
      .insert({
        pet_id: petA,
        organization_id: orgA,
        file_name: "test.pdf",
        storage_path: `${petA}/${RUN}-default.pdf`,
        mime_type: "application/pdf",
        size_bytes: 100,
        uploaded_by: uploader!.id,
      })
      .select("document_type")
      .single();

    expect(defaultError).toBeNull();
    expect(withDefault?.document_type).toBe("other");

    const { error: badTypeError } = await admin.from("documents").insert({
      pet_id: petA,
      organization_id: orgA,
      file_name: "test2.pdf",
      storage_path: `${petA}/${RUN}-bad.pdf`,
      mime_type: "application/pdf",
      size_bytes: 100,
      document_type: "not-a-real-type",
      uploaded_by: uploader!.id,
    });

    expect(badTypeError).not.toBeNull();
  });
});

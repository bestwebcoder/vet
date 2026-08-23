import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";

/**
 * Phase 9 · Checkpoint 1 — real delivery channels.
 *
 * This file covers the database layer: fan-out through enqueue_notification,
 * the widened unique index, the two new transactional triggers, and row
 * level security on the three new tables. Real provider delivery (email via
 * Mailpit, the sms/whatsapp safe-default, push retry/backoff, quiet hours)
 * is tests/notifications-dispatch.test.ts, which calls the dispatcher
 * directly rather than going through Postgres triggers.
 */

const RUN = runId();
const CHANNELS = ["email", "sms", "whatsapp", "push"];

let orgA: string;
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let doctorA: SupabaseClient;
let adminA: SupabaseClient;

let userIdA: string;
let clientRecordA: string;
let doctorRecordA: string;
let petA: string;
let medicationId: string;

let appointmentOffset = 0;

async function insertAppointment(status: "requested" | "confirmed" = "confirmed") {
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
      status,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function finalizeSoap(appointmentId: string) {
  const { error } = await admin.from("soap_records").insert({
    appointment_id: appointmentId,
    pet_id: petA,
    organization_id: orgA,
    doctor_id: doctorRecordA,
    chief_complaint: "Vomiting",
    clinical_assessment: "Gastritis",
    status: "finalized",
    finalized_at: new Date().toISOString(),
    weight_grams: 22_000,
  });
  if (error) throw error;
}

beforeAll(async () => {
  orgA = await organizationId();

  const [userA, userB, vetA, adminUser] = await Promise.all([
    createUserWithRole(`notif-a-${RUN}`, "client"),
    createUserWithRole(`notif-b-${RUN}`, "client"),
    createUserWithRole(`notif-vet-${RUN}`, "doctor"),
    createUserWithRole(`notif-admin-${RUN}`, "admin"),
  ]);
  userIdA = userA.userId;

  await admin.from("users").update({ phone: `+88015${RUN}91` }).eq("id", userIdA);

  const [{ data: clientRow }, { data: doctorRow }] = await Promise.all([
    admin
      .from("clients")
      .insert({ user_id: userIdA, organization_id: orgA, full_name: `Notif Client A ${RUN}`, phone: `+88015${RUN}91` })
      .select("id")
      .single(),
    admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
  ]);
  clientRecordA = clientRow!.id;
  doctorRecordA = doctorRow!.id;

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: pet } = await admin
    .from("pets")
    .insert({ client_id: clientRecordA, organization_id: orgA, name: `Notif Pet ${RUN}`, species_id: species!.id })
    .select("id")
    .single();
  petA = pet!.id;

  const { data: medication } = await admin.from("medications").select("id").eq("name", "Meloxicam").single();
  medicationId = medication!.id;

  [clientA, clientB, doctorA, adminA] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(userB.email),
    signedInClient(vetA.email),
    signedInClient(adminUser.email),
  ]);
}, 120_000);

describe("enqueue_notification fan-out", () => {
  it("creates one row per enabled channel by default", async () => {
    const appointmentId = await insertAppointment();
    const { data: vaccination, error } = await doctorA
      .from("vaccinations")
      .insert({
        appointment_id: appointmentId,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        vaccine_name: `Rabies ${RUN}`,
        date_administered: "2026-01-01",
        next_due_date: "2027-01-01",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from("notifications")
      .select("channel, status")
      .eq("related_table", "vaccinations")
      .eq("related_id", vaccination!.id)
      .eq("type", "vaccination_reminder");

    expect(rows).toHaveLength(4);
    expect(new Set(rows!.map((row) => row.channel))).toEqual(new Set(CHANNELS));
    expect(rows!.every((row) => row.status === "scheduled")).toBe(true);
  });

  it("excludes a channel the client has explicitly disabled, and collapses a re-save onto the same rows", async () => {
    const { error: prefError } = await clientA
      .from("notification_preferences")
      .insert({ user_id: userIdA, type: "vaccination_reminder", channel: "sms", enabled: false });
    expect(prefError).toBeNull();

    const appointmentId = await insertAppointment();
    const { data: vaccination, error: vaccinationError } = await doctorA
      .from("vaccinations")
      .insert({
        appointment_id: appointmentId,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        vaccine_name: `Distemper ${RUN}`,
        date_administered: "2026-01-01",
        next_due_date: "2027-02-01",
      })
      .select("id")
      .single();
    expect(vaccinationError).toBeNull();

    const { data: firstRows } = await admin
      .from("notifications")
      .select("channel")
      .eq("related_table", "vaccinations")
      .eq("related_id", vaccination!.id)
      .eq("type", "vaccination_reminder");
    expect(firstRows!.map((row) => row.channel).sort()).toEqual(["email", "push", "whatsapp"]);

    // Re-saving next_due_date re-fires the trigger — the same three rows
    // update in place, never a fourth.
    await doctorA.from("vaccinations").update({ next_due_date: "2027-03-01" }).eq("id", vaccination!.id);

    const { data: secondRows } = await admin
      .from("notifications")
      .select("id, channel, scheduled_for")
      .eq("related_table", "vaccinations")
      .eq("related_id", vaccination!.id)
      .eq("type", "vaccination_reminder");
    expect(secondRows).toHaveLength(3);
    expect(secondRows!.every((row) => row.scheduled_for?.startsWith("2027-02-22"))).toBe(true);
  });
});

describe("new transactional triggers", () => {
  it("appointment_confirmation fires only on the transition to confirmed", async () => {
    const appointmentId = await insertAppointment("requested");

    const { data: beforeConfirm } = await admin
      .from("notifications")
      .select("id")
      .eq("related_table", "appointments")
      .eq("related_id", appointmentId)
      .eq("type", "appointment_confirmation");
    expect(beforeConfirm).toEqual([]);

    await doctorA.from("appointments").update({ status: "confirmed" }).eq("id", appointmentId);

    const { data: afterConfirm } = await admin
      .from("notifications")
      .select("channel")
      .eq("related_table", "appointments")
      .eq("related_id", appointmentId)
      .eq("type", "appointment_confirmation");
    expect(afterConfirm!.length).toBe(4);
  });

  it("prescription_available fires when a prescription is finalized", async () => {
    const appointmentId = await insertAppointment();
    await finalizeSoap(appointmentId);

    const { data: prescription } = await doctorA
      .from("prescriptions")
      .insert({ appointment_id: appointmentId, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA })
      .select("id")
      .single();

    await doctorA.from("prescription_items").insert({
      prescription_id: prescription!.id,
      medication_id: medicationId,
      drug_name: "Meloxicam",
      dose_per_kg: 0.1,
      dose_unit: "mg",
      computed_dose: 2.2,
    });

    await doctorA
      .from("prescriptions")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", prescription!.id);

    const { data: notifications } = await admin
      .from("notifications")
      .select("channel")
      .eq("related_table", "prescriptions")
      .eq("related_id", prescription!.id)
      .eq("type", "prescription_available");
    expect(notifications!.length).toBe(4);
  });

  it("issuing an invoice enqueues both the due-date reminder and the immediate issued notification", async () => {
    const appointmentId = await insertAppointment();

    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
      .select("id")
      .single();
    expect(invoiceError).toBeNull();
    const invoiceId = invoice!.id as string;

    await admin.from("invoices").update({ status: "issued" }).eq("id", invoiceId);

    const { data: reminderRows } = await admin
      .from("notifications")
      .select("channel")
      .eq("related_table", "invoices")
      .eq("related_id", invoiceId)
      .eq("type", "invoice_reminder");
    const { data: issuedRows } = await admin
      .from("notifications")
      .select("channel")
      .eq("related_table", "invoices")
      .eq("related_id", invoiceId)
      .eq("type", "invoice_issued");

    expect(reminderRows!.length).toBe(4);
    expect(issuedRows!.length).toBe(4);
  });
});

describe("row level security", () => {
  it("a client cannot read or write another client's preferences or push subscriptions", async () => {
    const { data: seenByB } = await clientB.from("notification_preferences").select("id").eq("user_id", userIdA);
    expect(seenByB).toEqual([]);

    const { error: writeByB } = await clientB
      .from("notification_preferences")
      .insert({ user_id: userIdA, type: "vaccination_reminder", channel: "push", enabled: false });
    expect(writeByB).not.toBeNull();

    const { error: subInsertErr } = await clientA
      .from("push_subscriptions")
      .insert({ user_id: userIdA, endpoint: `https://push.example/${RUN}`, p256dh: "key", auth: "auth" });
    expect(subInsertErr).toBeNull();

    const { data: subSeenByB } = await clientB.from("push_subscriptions").select("id").eq("user_id", userIdA);
    expect(subSeenByB).toEqual([]);
  });

  it("only an admin can manage notification templates, and only for their own organization", async () => {
    const { error: clientErr } = await clientA
      .from("notification_templates")
      .insert({ organization_id: orgA, type: "vaccination_reminder", channel: "email", body_template: "x" });
    expect(clientErr).not.toBeNull();

    const { error: doctorErr } = await doctorA
      .from("notification_templates")
      .insert({ organization_id: orgA, type: "vaccination_reminder", channel: "email", body_template: "x" });
    expect(doctorErr).not.toBeNull();

    const { data: created, error: adminErr } = await adminA
      .from("notification_templates")
      .insert({
        organization_id: orgA,
        type: "vaccination_reminder",
        channel: "email",
        subject_template: `Reminder ${RUN}`,
        body_template: "{{body}}",
      })
      .select("id")
      .single();
    expect(adminErr).toBeNull();

    const { data: seenByClient } = await clientA.from("notification_templates").select("id").eq("id", created!.id);
    expect(seenByClient).toEqual([]);
  });

  it("only an admin can set quiet hours or retry a failed notification", async () => {
    const { data: updatedByClient } = await clientA
      .from("organizations")
      .update({ quiet_hours_start: "22:00", quiet_hours_end: "07:00" })
      .eq("id", orgA)
      .select("id");
    expect(updatedByClient).toEqual([]);

    const { data: updatedByAdmin } = await adminA
      .from("organizations")
      .update({ quiet_hours_start: "22:00", quiet_hours_end: "07:00" })
      .eq("id", orgA)
      .select("id");
    expect(updatedByAdmin).toHaveLength(1);

    const { data: failedRow } = await admin
      .from("notifications")
      .insert({
        organization_id: orgA,
        recipient_user_id: userIdA,
        type: "payment_confirmation",
        channel: "sms",
        status: "failed",
        title: "Test",
        failure_reason: "no provider configured",
      })
      .select("id")
      .single();

    const { data: retriedByDoctor } = await doctorA
      .from("notifications")
      .update({ status: "scheduled", retry_count: 0 })
      .eq("id", failedRow!.id)
      .select("id");
    expect(retriedByDoctor).toEqual([]);

    const { data: retriedByAdmin } = await adminA
      .from("notifications")
      .update({ status: "scheduled", retry_count: 0 })
      .eq("id", failedRow!.id)
      .select("id");
    expect(retriedByAdmin).toHaveLength(1);
  });
});

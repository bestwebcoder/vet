import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";
import { computeNextDewormingDueDate, MissingCustomIntervalError } from "@/lib/deworming-interval";
import { getDueInfo } from "@/lib/due-window";
import { computeNextVaccinationDueDate } from "@/lib/vaccination-schedule";

/**
 * Phase 6 · Checkpoint 1 — vaccination schedules, vaccinations, deworming,
 * and the reminder engine.
 *
 * Vaccinations and deworming records are editable, soft-deletable rows tied
 * to an appointment (the diagnoses/diagnostics shape from Phase 4), not
 * versioned documents — so the headline guarantees here are different from
 * soap.test.ts/prescriptions.test.ts: doctor-only authorship, an
 * admin-editable schedule catalog, and a reminder engine that creates and
 * logs exactly one scheduled notification per due date.
 */

describe("pure due-date helpers", () => {
  it("classifies every reminder window", () => {
    const today = new Date("2026-06-15T00:00:00");

    expect(getDueInfo(null, today).status).toBe("none");
    expect(getDueInfo("2026-08-01", today).status).toBe("upcoming");
    expect(getDueInfo("2026-06-30", today).status).toBe("due_in_30");
    expect(getDueInfo("2026-06-20", today).status).toBe("due_in_7");
    expect(getDueInfo("2026-06-15", today).status).toBe("due_today");
    expect(getDueInfo("2026-06-10", today).status).toBe("overdue");
    expect(getDueInfo("2026-06-10", today).label).toBe("overdue by 5 days");
  });

  it("computes a vaccination schedule's next due date", () => {
    expect(computeNextVaccinationDueDate("2026-01-15", 12, "months")).toBe("2027-01-15");
    expect(computeNextVaccinationDueDate("2026-01-15", 6, "months")).toBe("2026-07-15");
  });

  it("computes a deworming record's next due date for each interval", () => {
    expect(computeNextDewormingDueDate("2026-01-01", "monthly")).toBe("2026-01-31");
    expect(computeNextDewormingDueDate("2026-01-01", "quarterly")).toBe("2026-04-01");
    expect(computeNextDewormingDueDate("2026-01-01", "semi_annual")).toBe("2026-06-30");
    expect(computeNextDewormingDueDate("2026-01-01", "custom", 45)).toBe("2026-02-15");
  });

  it("refuses a custom interval with no day count", () => {
    expect(() => computeNextDewormingDueDate("2026-01-01", "custom", null)).toThrow(MissingCustomIntervalError);
  });
});

const RUN = runId();

let orgA: string;
let clientA: SupabaseClient;
let doctorA: SupabaseClient;
let adminA: SupabaseClient;
let clientB: SupabaseClient;

let clientUserIdA: string;
let clientRecordA: string;
let doctorRecordA: string;
let petA: string;

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

beforeAll(async () => {
  orgA = await organizationId();

  const [userA, userB, vetA, adminUser] = await Promise.all([
    createUserWithRole(`vax-a-${RUN}`, "client"),
    createUserWithRole(`vax-b-${RUN}`, "client"),
    createUserWithRole(`vax-vet-${RUN}`, "doctor"),
    createUserWithRole(`vax-admin-${RUN}`, "admin"),
  ]);
  clientUserIdA = userA.userId;

  const [{ data: clientRow }, { data: doctorRow }] = await Promise.all([
    admin
      .from("clients")
      .insert({ user_id: userA.userId, organization_id: orgA, full_name: `Vax Client A ${RUN}`, phone: `+88019${RUN}41` })
      .select("id")
      .single(),
    admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
  ]);

  clientRecordA = clientRow!.id;
  doctorRecordA = doctorRow!.id;

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: pet } = await admin
    .from("pets")
    .insert({ client_id: clientRecordA, organization_id: orgA, name: `Vax Pet ${RUN}`, species_id: species!.id })
    .select("id")
    .single();
  petA = pet!.id;

  [clientA, doctorA, adminA, clientB] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(vetA.email),
    signedInClient(adminUser.email),
    signedInClient(userB.email),
  ]);
}, 120_000);

describe("vaccination schedules — admin-configurable catalog", () => {
  it("is readable by every authenticated role, but written only by an admin", async () => {
    const { data: readByClient, error: readErr } = await clientA.from("vaccination_schedules").select("id").limit(1);
    expect(readErr).toBeNull();
    expect(readByClient?.length).toBe(1);

    const { error: doctorInsertErr } = await doctorA
      .from("vaccination_schedules")
      .insert({ organization_id: orgA, vaccine_name: "Not allowed", interval_value: 1, interval_unit: "years" });
    expect(doctorInsertErr).not.toBeNull();

    const { error: clientInsertErr } = await clientA
      .from("vaccination_schedules")
      .insert({ organization_id: orgA, vaccine_name: "Not allowed", interval_value: 1, interval_unit: "years" });
    expect(clientInsertErr).not.toBeNull();

    const { data: created, error: adminInsertErr } = await adminA
      .from("vaccination_schedules")
      .insert({ organization_id: orgA, vaccine_name: `Leptospirosis ${RUN}`, interval_value: 12, interval_unit: "months" })
      .select("id")
      .single();
    expect(adminInsertErr).toBeNull();

    const { error: adminUpdateErr } = await adminA
      .from("vaccination_schedules")
      .update({ interval_value: 6, interval_unit: "months" })
      .eq("id", created!.id);
    expect(adminUpdateErr).toBeNull();
  });
});

describe("clinical authorship is doctor-only", () => {
  it("stops a client or admin recording a vaccination, but lets a doctor", async () => {
    const appointmentId = await insertAppointment();

    const base = {
      appointment_id: appointmentId,
      pet_id: petA,
      organization_id: orgA,
      doctor_id: doctorRecordA,
      vaccine_name: "Rabies",
      date_administered: "2026-06-01",
    };

    const { error: clientErr } = await clientA.from("vaccinations").insert(base);
    expect(clientErr).not.toBeNull();

    const { error: adminErr } = await adminA.from("vaccinations").insert(base);
    expect(adminErr).not.toBeNull();

    const { error: doctorErr } = await doctorA.from("vaccinations").insert(base);
    expect(doctorErr).toBeNull();
  });

  it("stops a client or admin recording a deworming, but lets a doctor", async () => {
    const appointmentId = await insertAppointment();

    const base = {
      appointment_id: appointmentId,
      pet_id: petA,
      organization_id: orgA,
      doctor_id: doctorRecordA,
      product: "Praziquantel",
      date_administered: "2026-06-01",
      interval: "monthly",
      next_due_date: "2026-07-01",
    };

    const { error: clientErr } = await clientA.from("deworming_records").insert(base);
    expect(clientErr).not.toBeNull();

    const { error: adminErr } = await adminA.from("deworming_records").insert(base);
    expect(adminErr).not.toBeNull();

    const { error: doctorErr } = await doctorA.from("deworming_records").insert(base);
    expect(doctorErr).toBeNull();
  });
});

describe("client visibility", () => {
  it("sees a vaccination and deworming record for their own pet, but another client does not", async () => {
    const appointmentId = await insertAppointment();

    const { data: vaccination } = await doctorA
      .from("vaccinations")
      .insert({
        appointment_id: appointmentId,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        vaccine_name: "DHPP",
        date_administered: "2026-06-01",
        next_due_date: "2027-06-01",
      })
      .select("id")
      .single();

    const { data: seenByOwner } = await clientA.from("vaccinations").select("id").eq("id", vaccination!.id);
    expect(seenByOwner).toEqual([{ id: vaccination!.id }]);

    const { data: seenByStranger } = await clientB.from("vaccinations").select("id").eq("id", vaccination!.id);
    expect(seenByStranger).toEqual([]);
  });
});

describe("reminder engine", () => {
  it("creates one scheduled notification and logs it when a due date is set", async () => {
    const appointmentId = await insertAppointment();

    const { data: vaccination, error } = await doctorA
      .from("vaccinations")
      .insert({
        appointment_id: appointmentId,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        vaccine_name: "Bordetella",
        date_administered: "2026-06-01",
        next_due_date: "2026-12-01",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { data: notifications } = await admin
      .from("notifications")
      .select("id, type, status, channel, recipient_user_id")
      .eq("related_table", "vaccinations")
      .eq("related_id", vaccination!.id);

    expect(notifications).toHaveLength(1);
    expect(notifications![0]).toMatchObject({
      type: "vaccination_reminder",
      status: "scheduled",
      channel: "in_app",
      recipient_user_id: clientUserIdA,
    });

    const { data: logs } = await admin
      .from("notification_logs")
      .select("event")
      .eq("notification_id", notifications![0].id);
    expect((logs ?? []).some((row) => row.event === "scheduled")).toBe(true);

    // Editing the due date updates the existing reminder rather than creating a second one.
    const { error: updateErr } = await doctorA
      .from("vaccinations")
      .update({ next_due_date: "2026-12-15" })
      .eq("id", vaccination!.id);
    expect(updateErr).toBeNull();

    const { data: notificationsAfterUpdate } = await admin
      .from("notifications")
      .select("id, scheduled_for")
      .eq("related_table", "vaccinations")
      .eq("related_id", vaccination!.id);

    expect(notificationsAfterUpdate).toHaveLength(1);
    expect(notificationsAfterUpdate![0].id).toBe(notifications![0].id);
  });

  it("creates nothing when no due date is recorded", async () => {
    const appointmentId = await insertAppointment();

    const { data: vaccination } = await doctorA
      .from("vaccinations")
      .insert({
        appointment_id: appointmentId,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        vaccine_name: "Titre check",
        date_administered: "2026-06-01",
      })
      .select("id")
      .single();

    const { data: notifications } = await admin
      .from("notifications")
      .select("id")
      .eq("related_table", "vaccinations")
      .eq("related_id", vaccination!.id);

    expect(notifications).toEqual([]);
  });
});

describe("audit trail", () => {
  it("records vaccination and deworming creation", async () => {
    const appointmentId = await insertAppointment();

    const { data: vaccination } = await doctorA
      .from("vaccinations")
      .insert({
        appointment_id: appointmentId,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        vaccine_name: "Rabies",
        date_administered: "2026-06-01",
      })
      .select("id")
      .single();

    const { data: deworming } = await doctorA
      .from("deworming_records")
      .insert({
        appointment_id: appointmentId,
        pet_id: petA,
        organization_id: orgA,
        doctor_id: doctorRecordA,
        product: "Fenbendazole",
        date_administered: "2026-06-01",
        interval: "quarterly",
        next_due_date: "2026-09-01",
      })
      .select("id")
      .single();

    const [{ data: vaxLogs }, { data: dewormLogs }] = await Promise.all([
      admin.from("audit_logs").select("action").eq("entity_table", "vaccinations").eq("entity_id", vaccination!.id),
      admin
        .from("audit_logs")
        .select("action")
        .eq("entity_table", "deworming_records")
        .eq("entity_id", deworming!.id),
    ]);

    expect((vaxLogs ?? []).some((row) => row.action === "vaccinations.insert")).toBe(true);
    expect((dewormLogs ?? []).some((row) => row.action === "deworming_records.insert")).toBe(true);
  });
});

describe("status views", () => {
  it("report the most recently administered record per pet", async () => {
    const appointment1 = await insertAppointment();
    const appointment2 = await insertAppointment();

    await doctorA.from("vaccinations").insert({
      appointment_id: appointment1,
      pet_id: petA,
      organization_id: orgA,
      doctor_id: doctorRecordA,
      vaccine_name: "Older shot",
      date_administered: "2025-01-01",
      next_due_date: "2026-01-01",
    });

    await doctorA.from("vaccinations").insert({
      appointment_id: appointment2,
      pet_id: petA,
      organization_id: orgA,
      doctor_id: doctorRecordA,
      vaccine_name: "Newest shot",
      date_administered: "2026-06-10",
      next_due_date: "2027-06-10",
    });

    const { data: status, error } = await doctorA
      .from("pet_vaccination_status")
      .select("vaccine_name, next_due_date")
      .eq("pet_id", petA)
      .single();

    expect(error).toBeNull();
    expect(status).toMatchObject({ vaccine_name: "Newest shot", next_due_date: "2027-06-10" });
  });
});

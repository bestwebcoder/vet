import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";

/**
 * Phase 3 · Checkpoint 2 — appointments and the client update guard.
 *
 * The headline requirements are that two clients can never hold the same
 * doctor slot, and that a client can reschedule or cancel their own booking
 * but cannot otherwise rewrite it (doctor, service, or status to anything but
 * cancelled) — asserted through really signed-in database clients, the same
 * way tests/pets.test.ts tests the equivalent guarantees for patients.
 */

const RUN = runId();

let orgA: string;
let orgB: string;
let clientA: SupabaseClient;
let doctorA: SupabaseClient;
let adminA: SupabaseClient;
let doctorB: SupabaseClient;
let clientB: SupabaseClient;

let clientRecordA: string;
let clientRecordB: string;
let doctorRecordA: string;
let doctorRecordA2: string;
let serviceA: string;
let petA: string;
let petB: string;

function futureSlot(hoursFromNow: number, durationMinutes = 30) {
  const starts = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const ends = new Date(starts.getTime() + durationMinutes * 60 * 1000);
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
}

async function insertAppointment(values: Record<string, unknown>) {
  const { data, error } = await admin.from("appointments").insert(values).select("id").single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  orgA = await organizationId();

  const { data: otherOrg, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `Appointments Clinic ${RUN}`, slug: `appointments-clinic-${RUN}` })
    .select("id")
    .single();
  if (orgError) throw orgError;
  orgB = otherOrg.id;

  const [userA, userB, vetA, vetA2, vetB, adminUser] = await Promise.all([
    createUserWithRole(`appt-a-${RUN}`, "client"),
    createUserWithRole(`appt-b-${RUN}`, "client"),
    createUserWithRole(`appt-vet-${RUN}`, "doctor"),
    createUserWithRole(`appt-vet2-${RUN}`, "doctor"),
    createUserWithRole(`appt-vetb-${RUN}`, null),
    createUserWithRole(`appt-admin-${RUN}`, "admin"),
  ]);

  const { data: doctorRole } = await admin.from("roles").select("id").eq("slug", "doctor").single();
  await admin.from("user_roles").insert({ user_id: vetB.userId, role_id: doctorRole!.id, organization_id: orgB });

  // The fourth promise (vetB's doctors row) is awaited for its realism as a
  // fixture but its id is never needed: the cross-org isolation tests below
  // only depend on vetB's `doctor` role, granted separately above.
  const [{ data: clientRowA }, { data: clientRowB }, { data: doctorRowA }] = await Promise.all([
      admin
        .from("clients")
        .insert({
          user_id: userA.userId,
          organization_id: orgA,
          full_name: `Appt Client A ${RUN}`,
          phone: `+88018${RUN}11`,
        })
        .select("id")
        .single(),
      admin
        .from("clients")
        .insert({
          user_id: userB.userId,
          organization_id: orgA,
          full_name: `Appt Client B ${RUN}`,
          phone: `+88018${RUN}12`,
        })
        .select("id")
        .single(),
      admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
      admin.from("doctors").insert({ user_id: vetB.userId, organization_id: orgB }).select("id").single(),
    ]);

  const { data: doctorRowA2 } = await admin
    .from("doctors")
    .insert({ user_id: vetA2.userId, organization_id: orgA })
    .select("id")
    .single();

  clientRecordA = clientRowA!.id;
  clientRecordB = clientRowB!.id;
  doctorRecordA = doctorRowA!.id;
  doctorRecordA2 = doctorRowA2!.id;

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: service } = await admin
    .from("services")
    .select("id")
    .eq("organization_id", orgA)
    .eq("name", "General consultation")
    .single();
  serviceA = service!.id;

  const [{ data: petRowA }, { data: petRowB }] = await Promise.all([
    admin
      .from("pets")
      .insert({ client_id: clientRecordA, organization_id: orgA, name: `Appt Pet A ${RUN}`, species_id: species!.id })
      .select("id")
      .single(),
    admin
      .from("pets")
      .insert({ client_id: clientRecordB, organization_id: orgA, name: `Appt Pet B ${RUN}`, species_id: species!.id })
      .select("id")
      .single(),
  ]);
  petA = petRowA!.id;
  petB = petRowB!.id;

  // A wide-open availability window, so slot computation is not itself under
  // test here — that is Vitest-unit territory; this file is about the
  // database's own guarantees.
  const weekday = new Date().getDay();
  await admin.from("doctor_availability").insert({
    doctor_id: doctorRecordA,
    organization_id: orgA,
    weekday,
    starts_at: "00:00",
    ends_at: "23:30",
    slot_minutes: 15,
  });

  [clientA, doctorA, adminA, doctorB, clientB] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(vetA.email),
    signedInClient(adminUser.email),
    signedInClient(vetB.email),
    signedInClient(userB.email),
  ]);
}, 120_000);

describe("a client books their own appointment", () => {
  it("can book for their own pet with their own client", async () => {
    const slot = futureSlot(48);

    const { data, error } = await clientA
      .from("appointments")
      .insert({
        organization_id: orgA,
        client_id: clientRecordA,
        pet_id: petA,
        doctor_id: doctorRecordA,
        service_id: serviceA,
        visit_type: "clinic",
        ...slot,
      })
      .select("id, status");

    expect(error).toBeNull();
    expect(data?.[0]?.status).toBe("requested");
  });

  it("cannot book against another client's pet", async () => {
    const slot = futureSlot(49);

    const { error } = await clientA.from("appointments").insert({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petB,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...slot,
    });

    expect(error).not.toBeNull();
  });
});

describe("two clients cannot hold the same doctor slot", () => {
  it("rejects the second overlapping booking", async () => {
    const slot = futureSlot(72);

    const first = await insertAppointment({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...slot,
    });
    expect(first).toBeTruthy();

    const { error } = await admin.from("appointments").insert({
      organization_id: orgA,
      client_id: clientRecordB,
      pet_id: petB,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...slot,
    });

    expect(error?.code).toBe("23P01");
  });

  it("frees the slot once the first booking is cancelled", async () => {
    const slot = futureSlot(96);

    const first = await insertAppointment({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...slot,
    });

    await admin.from("appointments").update({ status: "cancelled" }).eq("id", first);

    const { error } = await admin.from("appointments").insert({
      organization_id: orgA,
      client_id: clientRecordB,
      pet_id: petB,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...slot,
    });

    expect(error).toBeNull();
  });
});

describe("doctor availability windows cannot overlap", () => {
  it("rejects a second overlapping window for the same doctor, day and visit type", async () => {
    const { error } = await admin.from("doctor_availability").insert({
      doctor_id: doctorRecordA,
      organization_id: orgA,
      weekday: new Date().getDay(),
      starts_at: "10:00",
      ends_at: "11:00",
    });

    expect(error?.code).toBe("23P01");
  });
});

describe("cross-tenancy isolation", () => {
  it("stops a doctor in another organisation seeing this appointment", async () => {
    const { data } = await doctorB.from("appointments").select("id").eq("client_id", clientRecordA);
    expect(data).toEqual([]);
  });

  it("stops client B seeing client A's appointments", async () => {
    const { data } = await clientB.from("appointments").select("id").eq("client_id", clientRecordA);
    expect(data).toEqual([]);
  });

  it("lets the practice's own doctor and admin see it", async () => {
    const [fromDoctor, fromAdmin] = await Promise.all([
      doctorA.from("appointments").select("id").eq("client_id", clientRecordA),
      adminA.from("appointments").select("id").eq("client_id", clientRecordA),
    ]);

    expect(fromDoctor.data!.length).toBeGreaterThan(0);
    expect(fromAdmin.data!.length).toBeGreaterThan(0);
  });
});

describe("a client may reschedule or cancel their own booking, and nothing else", () => {
  let appointmentId: string;

  beforeAll(async () => {
    appointmentId = await insertAppointment({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...futureSlot(120),
    });
  });

  it("may reschedule (starts_at/ends_at)", async () => {
    const slot = futureSlot(121);
    const { error } = await clientA
      .from("appointments")
      .update({ starts_at: slot.starts_at, ends_at: slot.ends_at })
      .eq("id", appointmentId);

    expect(error).toBeNull();
  });

  it("may not move it to a different doctor", async () => {
    const { error } = await clientA
      .from("appointments")
      .update({ doctor_id: doctorRecordA2 })
      .eq("id", appointmentId);

    expect(error).not.toBeNull();

    const { data } = await admin.from("appointments").select("doctor_id").eq("id", appointmentId).single();
    expect(data?.doctor_id).toBe(doctorRecordA);
  });

  it("may not set status to completed directly", async () => {
    const { error } = await clientA
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", appointmentId);

    expect(error).not.toBeNull();
  });

  it("may cancel", async () => {
    const { error } = await clientA
      .from("appointments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", appointmentId);

    expect(error).toBeNull();

    const { data } = await admin.from("appointments").select("status").eq("id", appointmentId).single();
    expect(data?.status).toBe("cancelled");
  });

  it("may not change anything on an appointment that is already final", async () => {
    const { error } = await clientA
      .from("appointments")
      .update({ starts_at: futureSlot(200).starts_at })
      .eq("id", appointmentId);

    expect(error).not.toBeNull();
  });
});

describe("staff may move an appointment through its full lifecycle", () => {
  it("confirms, checks in, starts and completes", async () => {
    const appointmentId = await insertAppointment({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...futureSlot(150),
    });

    for (const status of ["confirmed", "checked_in", "in_consultation", "completed"]) {
      const { error } = await doctorA.from("appointments").update({ status }).eq("id", appointmentId);
      expect(error).toBeNull();
    }

    const { data } = await admin.from("appointments").select("status").eq("id", appointmentId).single();
    expect(data?.status).toBe("completed");
  });
});

describe("the notice window", () => {
  it("may_client_change_appointment allows a far-future booking", async () => {
    const { data, error } = await admin.rpc("may_client_change_appointment", {
      p_starts_at: futureSlot(200).starts_at,
      p_organization_id: orgA,
    });

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("may_client_change_appointment refuses one starting within the notice period", async () => {
    const { data, error } = await admin.rpc("may_client_change_appointment", {
      p_starts_at: futureSlot(0.05).starts_at, // 3 minutes out
      p_organization_id: orgA,
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});

describe("audit trail", () => {
  it("records appointment creation", async () => {
    const appointmentId = await insertAppointment({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...futureSlot(175),
    });

    const { data } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", appointmentId)
      .eq("action", "appointments.insert");

    expect(data).toHaveLength(1);
  });

  it("records status changes with a before and after", async () => {
    const appointmentId = await insertAppointment({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...futureSlot(176),
    });

    await doctorA.from("appointments").update({ status: "confirmed" }).eq("id", appointmentId);

    const { data } = await admin
      .from("audit_logs")
      .select("metadata")
      .eq("entity_id", appointmentId)
      .eq("action", "appointments.update")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(data?.[0]?.metadata).toMatchObject({ status: { from: "requested", to: "confirmed" } });
  });
});

describe("nobody can delete an appointment through the table", () => {
  it("grants DELETE to nobody, so appointments are only ever cancelled", async () => {
    const appointmentId = await insertAppointment({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceA,
      visit_type: "clinic",
      ...futureSlot(177),
    });

    for (const actor of [clientA, doctorA, adminA]) {
      const { error } = await actor.from("appointments").delete().eq("id", appointmentId);
      expect(error?.code).toBe("42501");
    }
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createOrganization, createUserWithRole, runId, signedInClient } from "./setup/http";

/**
 * Branch management — 20260922000100_branch_management.sql.
 *
 * The screen is in Settings, but the rules worth pinning are the database's:
 * who may write a branch, that a practice never ends up with two primaries,
 * and that a branch anything points at cannot be deleted out from under it.
 */

const RUN = runId();

let orgA: string;
let adminA: SupabaseClient;
let doctorA: SupabaseClient;

let mainId: string;
let secondId: string;
let doctorRecordId: string;

async function branchRow(id: string) {
  const { data } = await admin.from("branches").select("name, is_primary, is_active").eq("id", id).single();
  return data!;
}

beforeAll(async () => {
  orgA = await createOrganization(`branches-${RUN}`);

  const [adminUser, vet] = await Promise.all([
    createUserWithRole(`br-admin-${RUN}`, "admin", orgA),
    createUserWithRole(`br-vet-${RUN}`, "doctor", orgA),
  ]);

  // createOrganization gives every practice a primary "Main".
  const { data: main } = await admin
    .from("branches")
    .select("id")
    .eq("organization_id", orgA)
    .eq("is_primary", true)
    .single();
  mainId = main!.id;

  const { data: second } = await admin
    .from("branches")
    .insert({ organization_id: orgA, name: `Second ${RUN}`, slug: `second-${RUN}` })
    .select("id")
    .single();
  secondId = second!.id;

  const { data: doctorRow } = await admin
    .from("doctors")
    .insert({ user_id: vet.userId, organization_id: orgA })
    .select("id")
    .single();
  doctorRecordId = doctorRow!.id;

  [adminA, doctorA] = await Promise.all([signedInClient(adminUser.email), signedInClient(vet.email)]);
}, 180_000);

describe("who may manage branches", () => {
  it("lets an admin rename one — the grant this migration adds", async () => {
    const { error } = await adminA.from("branches").update({ name: `Renamed ${RUN}` }).eq("id", secondId);

    expect(error).toBeNull();
    expect((await branchRow(secondId)).name).toBe(`Renamed ${RUN}`);
  });

  it("refuses a doctor", async () => {
    await doctorA.from("branches").update({ name: "Doctor was here" }).eq("id", secondId);

    expect((await branchRow(secondId)).name).toBe(`Renamed ${RUN}`);
  });

  it("lets any member of the practice read them, which is what booking needs", async () => {
    const { data, error } = await doctorA.from("branches").select("id").eq("organization_id", orgA);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("exactly one primary", () => {
  it("moves the primary in a single step, never leaving none", async () => {
    const { error } = await adminA.rpc("set_primary_branch", { p_branch_id: secondId });
    expect(error).toBeNull();

    expect((await branchRow(secondId)).is_primary).toBe(true);
    expect((await branchRow(mainId)).is_primary).toBe(false);

    const { data } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", orgA)
      .eq("is_primary", true)
      .is("deleted_at", null);
    expect((data ?? []).length).toBe(1);
  });

  it("refuses to repoint a practice the caller does not administer", async () => {
    const { error } = await doctorA.rpc("set_primary_branch", { p_branch_id: mainId });

    expect(error).not.toBeNull();
    expect((await branchRow(secondId)).is_primary).toBe(true);
  });

  it("cannot be talked into two primaries at once", async () => {
    const { error } = await adminA.from("branches").update({ is_primary: true }).eq("id", mainId);

    expect(error).not.toBeNull();
  });
});

describe("deleting a branch", () => {
  it("removes one nothing points at", async () => {
    const { data: spare } = await admin
      .from("branches")
      .insert({ organization_id: orgA, name: `Spare ${RUN}`, slug: `spare-${RUN}` })
      .select("id")
      .single();

    const { error } = await adminA.from("branches").delete().eq("id", spare!.id);
    expect(error).toBeNull();

    const { data: after } = await admin.from("branches").select("id").eq("id", spare!.id).maybeSingle();
    expect(after).toBeNull();
  });

  it("keeps one an appointment points at, whatever the caller asks", async () => {
    const { data: client } = await admin
      .from("clients")
      .insert({ organization_id: orgA, full_name: `Owner ${RUN}`, phone: `+8801714${RUN}` })
      .select("id")
      .single();

    const { data: species } = await admin.from("species").select("id").limit(1).single();
    const { data: pet } = await admin
      .from("pets")
      .insert({ client_id: client!.id, organization_id: orgA, name: `Pet ${RUN}`, species_id: species!.id })
      .select("id")
      .single();

    const { data: service } = await admin
      .from("services")
      .select("id")
      .eq("organization_id", orgA)
      .limit(1)
      .single();

    const starts = new Date(Date.now() + 86_400_000);
    const { error: fixtureError } = await admin.from("appointments").insert({
      organization_id: orgA,
      client_id: client!.id,
      pet_id: pet!.id,
      service_id: service!.id,
      doctor_id: doctorRecordId,
      branch_id: mainId,
      visit_type: "clinic",
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 30 * 60_000).toISOString(),
    });
    // Assert the fixture landed: a silently failed insert would make the real
    // assertion below pass for the wrong reason.
    expect(fixtureError).toBeNull();

    const { error } = await adminA.from("branches").delete().eq("id", mainId);
    expect(error).not.toBeNull();

    const { data: still } = await admin.from("branches").select("id").eq("id", mainId).maybeSingle();
    expect(still).not.toBeNull();
  });
});

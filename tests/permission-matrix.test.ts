import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";

/**
 * Phase 10 · §10.2's permission matrix, verified by explicit tests rather
 * than by inspection (the DoD's own words) — focused on genuinely new
 * ground this phase adds (doctor management, organization settings) plus
 * one regression test for a real bug this phase's own manual verification
 * caught: deactivating a doctor revoked their user_roles grant, and
 * can_view_user() required every branch to have an un-revoked grant —
 * including the admin-sees-their-own-org-people branch — so the admin who
 * just deactivated someone could no longer see who they had deactivated.
 * Every other module's client/doctor/admin boundary (SOAP, prescriptions,
 * billing, reports, notifications) already has its own explicit RLS tests
 * in that module's own test file; this file does not re-litigate them.
 */

const RUN = runId();

let orgA: string;
let clientA: SupabaseClient;
let doctorA: SupabaseClient;
let adminA: SupabaseClient;

let doctorARecordId: string;
let doctorBRecordId: string;

beforeAll(async () => {
  orgA = await organizationId();

  const [userA, vetA, vetB, adminUser] = await Promise.all([
    createUserWithRole(`perm-client-${RUN}`, "client"),
    createUserWithRole(`perm-vet-a-${RUN}`, "doctor"),
    createUserWithRole(`perm-vet-b-${RUN}`, "doctor"),
    createUserWithRole(`perm-admin-${RUN}`, "admin"),
  ]);

  const [{ data: doctorRowA }, { data: doctorRowB }] = await Promise.all([
    admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
    admin.from("doctors").insert({ user_id: vetB.userId, organization_id: orgA }).select("id").single(),
  ]);
  doctorARecordId = doctorRowA!.id;
  doctorBRecordId = doctorRowB!.id;

  [clientA, doctorA, adminA] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(vetA.email),
    signedInClient(adminUser.email),
  ]);
}, 120_000);

describe("doctor management is admin-only", () => {
  it("stops a client or a doctor creating a doctor profile, but lets an admin", async () => {
    const { userId } = await createUserWithRole(`perm-newdoc-${RUN}`, null);
    const base = { user_id: userId, organization_id: orgA };

    const { error: clientErr } = await clientA.from("doctors").insert(base);
    expect(clientErr).not.toBeNull();

    const { error: doctorErr } = await doctorA.from("doctors").insert(base);
    expect(doctorErr).not.toBeNull();

    const { error: adminErr } = await adminA.from("doctors").insert(base);
    expect(adminErr).toBeNull();
  });

  it("stops a client or a doctor granting the doctor role, but lets an admin", async () => {
    const { userId } = await createUserWithRole(`perm-newrole-${RUN}`, null);
    const { data: role } = await admin.from("roles").select("id").eq("slug", "doctor").single();
    const base = { user_id: userId, role_id: role!.id, organization_id: orgA };

    const { error: clientErr } = await clientA.from("user_roles").insert(base);
    expect(clientErr).not.toBeNull();

    const { error: doctorErr } = await doctorA.from("user_roles").insert(base);
    expect(doctorErr).not.toBeNull();

    const { error: adminErr } = await adminA.from("user_roles").insert(base);
    expect(adminErr).toBeNull();
  });

  it("stops one doctor editing another doctor's clinical profile, but lets them edit their own", async () => {
    const { data: onOther } = await doctorA
      .from("doctors")
      .update({ specialization: "Not allowed" })
      .eq("id", doctorBRecordId)
      .select("id");
    expect(onOther).toEqual([]);

    const { data: onOwn, error: ownErr } = await doctorA
      .from("doctors")
      .update({ specialization: `Small animal medicine ${RUN}` })
      .eq("id", doctorARecordId)
      .select("id");
    expect(ownErr).toBeNull();
    expect(onOwn).toHaveLength(1);
  });

  it("stops a client or a doctor deactivating a doctor, but lets an admin", async () => {
    const { data: byClient } = await clientA.from("doctors").update({ deleted_at: new Date().toISOString() }).eq("id", doctorARecordId).select("id");
    expect(byClient).toEqual([]);

    const { data: byOtherDoctor } = await doctorA
      .from("doctors")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", doctorBRecordId)
      .select("id");
    expect(byOtherDoctor).toEqual([]);

    const { data: byAdmin, error: adminErr } = await adminA
      .from("doctors")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", doctorARecordId)
      .select("id");
    expect(adminErr).toBeNull();
    expect(byAdmin).toHaveLength(1);

    // Undo, so later tests in this file see an active doctor again.
    await admin.from("doctors").update({ deleted_at: null }).eq("id", doctorARecordId);
  });
});

describe("regression: an admin can still see someone they just revoked", () => {
  it("keeps a revoked user's profile visible to the admin who revoked them", async () => {
    const { userId } = await createUserWithRole(`perm-revoke-${RUN}`, "doctor");

    const { data: seenBefore } = await adminA.from("users").select("id, full_name").eq("id", userId).maybeSingle();
    expect(seenBefore).not.toBeNull();

    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId);

    const { data: seenAfter } = await adminA.from("users").select("id, full_name").eq("id", userId).maybeSingle();
    expect(seenAfter, "an admin must still be able to see a person after revoking their access").not.toBeNull();
  });
});

describe("organization settings are admin-only", () => {
  it("stops a client or a doctor updating practice identity, but lets an admin", async () => {
    const { data: byClient } = await clientA.from("organizations").update({ city: "Not allowed" }).eq("id", orgA).select("id");
    expect(byClient).toEqual([]);

    const { data: byDoctor } = await doctorA.from("organizations").update({ city: "Not allowed" }).eq("id", orgA).select("id");
    expect(byDoctor).toEqual([]);

    const { data: byAdmin, error: adminErr } = await adminA
      .from("organizations")
      .update({ city: `Dhaka ${RUN}` })
      .eq("id", orgA)
      .select("id");
    expect(adminErr).toBeNull();
    expect(byAdmin).toHaveLength(1);
  });
});

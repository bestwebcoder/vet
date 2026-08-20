import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

/**
 * Checkpoint 3 verification — cross-account access.
 *
 * Every assertion runs through a really signed-in user against PostgREST, not
 * through the service role, because that is the path a browser takes. Fixtures
 * are suffixed per run: nothing here can be cleaned up afterwards, since
 * foreign keys restrict and audit_logs is append-only by design. Run
 * `npm run db:reset` to clear.
 */

const publicEnv = parsePublicEnv(process.env);
const serverEnv = parseServerEnv(process.env);

// Digits only: phone numbers carry this suffix and are CHECK-constrained.
const RUN = Math.floor(Math.random() * 1_000_000)
  .toString()
  .padStart(6, "0");

const admin = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const PASSWORD = "Test-Password-123";

type Actor = {
  userId: string;
  email: string;
  db: SupabaseClient;
};

/** Creates an auth user, its profile, and a role grant; returns a signed-in client. */
async function createActor(
  label: string,
  roleSlug: "client" | "doctor" | "admin",
  organizationId: string,
): Promise<Actor> {
  const email = `${label}-${RUN}@tvcare.test`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;
  const userId = created.user.id;

  const { error: profileError } = await admin
    .from("users")
    .insert({ id: userId, full_name: `${label} ${RUN}`, email });
  if (profileError) throw profileError;

  const { data: role } = await admin.from("roles").select("id").eq("slug", roleSlug).single();

  const { error: grantError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: role!.id, organization_id: organizationId });
  if (grantError) throw grantError;

  const db = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;

  return { userId, email, db };
}

let orgA: string;
let orgB: string;
let clientA: Actor;
let clientB: Actor;
let doctorA: Actor;
let adminA: Actor;
let clientRecordA: string;
let clientRecordB: string;
let clientRecordOrgB: string;
let clientOrgBUserId: string;

beforeAll(async () => {
  const { data: seeded } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "the-traveling-vet")
    .single();
  orgA = seeded!.id;

  // A second organization, so "another client" and "another tenant" are
  // distinct failure modes rather than one blurred case.
  const { data: other, error: otherError } = await admin
    .from("organizations")
    .insert({ name: `Other Clinic ${RUN}`, slug: `other-clinic-${RUN}` })
    .select("id")
    .single();
  if (otherError) throw otherError;
  orgB = other!.id;

  [clientA, clientB, doctorA, adminA] = await Promise.all([
    createActor("client-a", "client", orgA),
    createActor("client-b", "client", orgA),
    createActor("doctor-a", "doctor", orgA),
    createActor("admin-a", "admin", orgA),
  ]);
  const clientOrgB = await createActor("client-orgb", "client", orgB);
  clientOrgBUserId = clientOrgB.userId;

  await admin.from("doctors").insert({ user_id: doctorA.userId, organization_id: orgA });

  const records = await admin
    .from("clients")
    .insert([
      { user_id: clientA.userId, organization_id: orgA, full_name: `Client A ${RUN}`, phone: `+88017${RUN}01` },
      { user_id: clientB.userId, organization_id: orgA, full_name: `Client B ${RUN}`, phone: `+88017${RUN}02` },
      { user_id: clientOrgB.userId, organization_id: orgB, full_name: `Client OrgB ${RUN}`, phone: `+88017${RUN}03` },
    ])
    .select("id, user_id");
  if (records.error) throw records.error;

  clientRecordA = records.data!.find((r) => r.user_id === clientA.userId)!.id;
  clientRecordB = records.data!.find((r) => r.user_id === clientB.userId)!.id;
  clientRecordOrgB = records.data!.find((r) => r.user_id === clientOrgB.userId)!.id;
}, 60_000);

describe("a client reaches only their own records", () => {
  it("reads their own client record", async () => {
    const { data } = await clientA.db.from("clients").select("id");
    expect(data?.map((r) => r.id)).toEqual([clientRecordA]);
  });

  it("cannot read another client in the same organization", async () => {
    const { data } = await clientA.db.from("clients").select("id").eq("id", clientRecordB);
    expect(data).toEqual([]);
  });

  it("cannot read a client in another organization", async () => {
    const { data } = await clientA.db.from("clients").select("id").eq("id", clientRecordOrgB);
    expect(data).toEqual([]);
  });

  it("cannot read another client's profile", async () => {
    const { data } = await clientA.db.from("users").select("id").eq("id", clientB.userId);
    expect(data).toEqual([]);
  });

  it("reads their own profile", async () => {
    const { data } = await clientA.db.from("users").select("id").eq("id", clientA.userId);
    expect(data?.map((r) => r.id)).toEqual([clientA.userId]);
  });

  it("can see the doctors of their organization, which booking depends on", async () => {
    const { data } = await clientA.db.from("users").select("id").eq("id", doctorA.userId);
    expect(data?.map((r) => r.id)).toEqual([doctorA.userId]);
  });

  it("sees only their own organization", async () => {
    const { data } = await clientA.db.from("organizations").select("id");
    expect(data?.map((r) => r.id)).toEqual([orgA]);
  });
});

describe("clinic staff are scoped to their organization", () => {
  it("lets a doctor read clients of their own organization", async () => {
    const { data } = await doctorA.db.from("clients").select("id");
    const ids = data?.map((r) => r.id) ?? [];
    expect(ids).toContain(clientRecordA);
    expect(ids).toContain(clientRecordB);
  });

  it("stops a doctor reading a client of another organization", async () => {
    const { data } = await doctorA.db.from("clients").select("id").eq("id", clientRecordOrgB);
    expect(data).toEqual([]);
  });

  it("stops an admin reading a client of another organization", async () => {
    const { data } = await adminA.db.from("clients").select("id").eq("id", clientRecordOrgB);
    expect(data).toEqual([]);
  });
});

describe("writes are constrained", () => {
  it("stops a client creating a client record", async () => {
    const { error } = await clientA.db
      .from("clients")
      .insert({ organization_id: orgA, full_name: "Injected", phone: "+8801700000999" });
    expect(error).not.toBeNull();
  });

  it("stops a client editing another client's record", async () => {
    const { error, data } = await clientA.db
      .from("clients")
      .update({ city: "Hijacked" })
      .eq("id", clientRecordB)
      .select("id");

    // No matching row passes the policy, so the update silently affects nothing.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("stops a client moving their record into another organization", async () => {
    const { error } = await clientA.db
      .from("clients")
      .update({ organization_id: orgB })
      .eq("id", clientRecordA);

    expect(error?.code).toBe("42501");
  });

  it("stops a client granting themselves a role", async () => {
    const { data: adminRole } = await admin.from("roles").select("id").eq("slug", "admin").single();

    const { error } = await clientA.db
      .from("user_roles")
      .insert({ user_id: clientA.userId, role_id: adminRole!.id, organization_id: orgA });

    expect(error).not.toBeNull();
  });

  it("stops an admin minting a super admin", async () => {
    const { data: superRole } = await admin
      .from("roles")
      .select("id")
      .eq("slug", "super_admin")
      .single();

    const { error } = await adminA.db
      .from("user_roles")
      .insert({ user_id: adminA.userId, role_id: superRole!.id, organization_id: orgA });

    expect(error).not.toBeNull();
  });

  it("grants DELETE to nobody, so records can only be soft-deleted", async () => {
    for (const actor of [clientA, doctorA, adminA]) {
      const { error } = await actor.db.from("clients").delete().eq("id", clientRecordA);
      expect(error?.code).toBe("42501");
    }
  });

  it("lets a client update their own permitted fields", async () => {
    const { error, data } = await clientA.db
      .from("clients")
      .update({ city: "Dhaka" })
      .eq("id", clientRecordA)
      .select("city");

    expect(error).toBeNull();
    expect(data).toEqual([{ city: "Dhaka" }]);
  });
});

describe("audit logging", () => {
  it("records a login", async () => {
    const { data } = await admin
      .from("audit_logs")
      .select("action, actor_user_id")
      .eq("actor_user_id", clientA.userId)
      .eq("action", "auth.login");

    expect(data?.length).toBeGreaterThanOrEqual(1);
  });

  it("records user creation", async () => {
    const { data } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", clientA.userId)
      .eq("action", "users.insert");

    expect(data?.length).toBe(1);
  });

  it("records an update with a before and after", async () => {
    await clientA.db.from("users").update({ phone: "+8801711111111" }).eq("id", clientA.userId);

    const { data } = await admin
      .from("audit_logs")
      .select("metadata")
      .eq("entity_id", clientA.userId)
      .eq("action", "users.update")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(data?.[0]?.metadata).toMatchObject({ phone: { from: null, to: "+8801711111111" } });
  });

  it("shows a client only their own actions", async () => {
    const { data } = await clientA.db.from("audit_logs").select("actor_user_id");
    const actors = new Set(data?.map((r) => r.actor_user_id));

    expect(actors.has(clientB.userId)).toBe(false);
    for (const actor of actors) {
      expect(actor).toBe(clientA.userId);
    }
  });

  it("shows an admin their own organization's audit trail and no other", async () => {
    const { data } = await adminA.db.from("audit_logs").select("id, organization_id");

    expect(data?.length).toBeGreaterThan(0);
    // Rows about a profile carry no organization; anything that does carry one
    // must be this admin's own.
    expect(data?.some((r) => r.organization_id !== null && r.organization_id !== orgA)).toBe(false);
  });

  it("lets an admin see profile events for their own people", async () => {
    const { data } = await adminA.db
      .from("audit_logs")
      .select("entity_id")
      .eq("entity_table", "users")
      .eq("entity_id", clientA.userId);

    expect(data?.length).toBeGreaterThanOrEqual(1);
  });

  it("hides another organization's profile events from an admin", async () => {
    const { data } = await adminA.db
      .from("audit_logs")
      .select("entity_id")
      .eq("entity_table", "users")
      .eq("entity_id", clientOrgBUserId);

    expect(data).toEqual([]);
  });

  it("is append-only, even for the service role", async () => {
    const { data: row } = await admin.from("audit_logs").select("id").limit(1).single();

    const updated = await admin.from("audit_logs").update({ action: "tampered" }).eq("id", row!.id);
    expect(updated.error?.message).toMatch(/append-only/);

    const deleted = await admin.from("audit_logs").delete().eq("id", row!.id);
    expect(deleted.error?.message).toMatch(/append-only/);
  });
});

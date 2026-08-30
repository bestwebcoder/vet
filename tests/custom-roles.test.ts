import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createOrganization, createUserWithRole, runId, signedInClient } from "./setup/http";

/**
 * Roles a practice defines for itself, and the permissions behind them.
 *
 * The point of these tests is that the matrix is not decorative. A permission
 * screen that ticks boxes without changing what the database returns is worse
 * than none at all in a system holding clinical records — it reads as
 * authoritative while granting nothing, or worse, granting everything. So
 * every assertion here goes through a really signed-in session and asks the
 * policies, not the application.
 */

const RUN = runId();

let orgA: string;
let orgB: string;
let adminA: SupabaseClient;

/** A role with exactly one thing it may do, and the person who holds it. */
async function makeRole(
  organization: string,
  label: string,
  permissions: string[],
): Promise<string> {
  const { data, error } = await admin
    .from("roles")
    .insert({
      name: `Role ${label}`,
      slug: `role_${label}`,
      organization_id: organization,
      is_system: false,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (permissions.length > 0) {
    const { error: grantError } = await admin
      .from("role_permissions")
      .insert(permissions.map((key) => ({ role_id: data.id, permission_key: key })));

    if (grantError) throw grantError;
  }

  return data.id as string;
}

async function signedInHolder(label: string, roleId: string, organization: string): Promise<SupabaseClient> {
  const { email, userId } = await createUserWithRole(`custom-${label}-${RUN}`, null);

  const { error } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: roleId, organization_id: organization });

  if (error) throw error;

  return signedInClient(email);
}

beforeAll(async () => {
  // Its own practice, not the seeded one: these tests add clients, and adding
  // them to the practice every other suite reads from is how a fixture starts
  // failing tests it has nothing to do with.
  orgA = await createOrganization(`custom-${RUN}`);
  orgB = await createOrganization(`custom-other-${RUN}`);

  const adminUser = await createUserWithRole(`custom-admin-${RUN}`, "admin", orgA);
  adminA = await signedInClient(adminUser.email);

  // One client to read, in each practice.
  await admin.from("clients").insert([
    { organization_id: orgA, full_name: `Ours ${RUN}`, phone: `+880191${RUN}0` },
    { organization_id: orgB, full_name: `Theirs ${RUN}`, phone: `+880192${RUN}0` },
  ]);
}, 120_000);

describe("a role a practice defined itself", () => {
  it("reads what its permissions allow, and nothing else", async () => {
    const roleId = await makeRole(orgA, `reader${RUN}`, ["clients.view"]);
    const holder = await signedInHolder(`reader${RUN}`, roleId, orgA);

    const clients = await holder.from("clients").select("id, full_name");
    expect(clients.error).toBeNull();
    expect(clients.data?.length ?? 0).toBeGreaterThan(0);

    // Not granted: invoices are a different module entirely.
    const invoices = await holder.from("invoices").select("id");
    expect(invoices.data ?? []).toEqual([]);
  });

  it("cannot write what it may only view", async () => {
    const roleId = await makeRole(orgA, `viewonly${RUN}`, ["clients.view"]);
    const holder = await signedInHolder(`viewonly${RUN}`, roleId, orgA);

    const { error } = await holder
      .from("clients")
      .insert({ organization_id: orgA, full_name: `Nope ${RUN}`, phone: `+880193${RUN}1` });

    expect(error).not.toBeNull();
  });

  it("writes what it may manage", async () => {
    const roleId = await makeRole(orgA, `writer${RUN}`, ["clients.view", "clients.manage"]);
    const holder = await signedInHolder(`writer${RUN}`, roleId, orgA);

    const { data, error } = await holder
      .from("clients")
      .insert({ organization_id: orgA, full_name: `Made by a custom role ${RUN}`, phone: `+880193${RUN}2` })
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("holds its permissions only in its own practice", async () => {
    const roleId = await makeRole(orgA, `scoped${RUN}`, ["clients.view"]);
    const holder = await signedInHolder(`scoped${RUN}`, roleId, orgA);

    // Asked by name rather than by reading the table: a seeded practice has
    // more clients than PostgREST returns in one unfiltered page, and this
    // test is about two specific rows.
    const { data } = await holder.from("clients").select("full_name").in("full_name", [`Ours ${RUN}`, `Theirs ${RUN}`]);
    const names = (data ?? []).map((row) => row.full_name);

    expect(names).toContain(`Ours ${RUN}`);
    expect(names).not.toContain(`Theirs ${RUN}`);
  });

  it("loses the access when the permission is taken away", async () => {
    const roleId = await makeRole(orgA, `revoked${RUN}`, ["clients.view"]);
    const holder = await signedInHolder(`revoked${RUN}`, roleId, orgA);

    expect((await holder.from("clients").select("id")).data?.length ?? 0).toBeGreaterThan(0);

    await admin.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", "clients.view");

    expect((await holder.from("clients").select("id")).data ?? []).toEqual([]);
  });

  it("stops working the moment the role is deleted, without touching the grant", async () => {
    const roleId = await makeRole(orgA, `deleted${RUN}`, ["clients.view"]);
    const holder = await signedInHolder(`deleted${RUN}`, roleId, orgA);

    expect((await holder.from("clients").select("id")).data?.length ?? 0).toBeGreaterThan(0);

    await admin.from("roles").update({ deleted_at: new Date().toISOString() }).eq("id", roleId);

    expect((await holder.from("clients").select("id")).data ?? []).toEqual([]);
  });
});

describe("the permission model cannot be used to escalate", () => {
  it("stops a custom role editing roles, however many permissions it holds", async () => {
    const { data: everyPermission } = await admin.from("permissions").select("key");
    const keys = (everyPermission ?? []).map((row) => row.key as string);

    const roleId = await makeRole(orgA, `everything${RUN}`, keys);
    const holder = await signedInHolder(`everything${RUN}`, roleId, orgA);

    // Holding every permission in the catalogue is still not permission to
    // define roles: that is the one thing the matrix deliberately cannot grant.
    const created = await holder
      .from("roles")
      .insert({ name: "Escalation", slug: `escalation_${RUN}`, organization_id: orgA, is_system: false })
      .select("id");

    expect(created.error).not.toBeNull();

    const granted = await holder
      .from("role_permissions")
      .insert({ role_id: roleId, permission_key: "billing.manage" });

    expect(granted.error).not.toBeNull();

    // Nor to hand themselves a role.
    const { userId } = await createUserWithRole(`custom-victim-${RUN}`, null);
    const assigned = await holder
      .from("user_roles")
      .insert({ user_id: userId, role_id: roleId, organization_id: orgA });

    expect(assigned.error).not.toBeNull();
  });

  it("refuses to let anybody edit a built-in role", async () => {
    const { data: builtIn } = await admin.from("roles").select("id").eq("slug", "receptionist").single();

    const renamed = await adminA.from("roles").update({ name: "Renamed" }).eq("id", builtIn!.id).select("id");
    expect(renamed.data ?? []).toEqual([]);

    const regranted = await adminA
      .from("role_permissions")
      .insert({ role_id: builtIn!.id, permission_key: "billing.manage" });
    expect(regranted.error).not.toBeNull();
  });

  it("keeps one practice's roles out of another's", async () => {
    const roleId = await makeRole(orgB, `theirs${RUN}`, ["clients.view"]);

    const { data } = await adminA.from("roles").select("id").eq("id", roleId);
    expect(data ?? []).toEqual([]);
  });
});

describe("the built-in roles still mean what they meant", () => {
  it("grants the matrix only to admin, and leaves the rest to their own policies", async () => {
    const { data } = await admin
      .from("roles")
      .select("slug, role_permissions(permission_key)")
      .eq("is_system", true);

    const bySlug = new Map(
      (data ?? []).map((row) => [
        row.slug as string,
        ((row.role_permissions ?? []) as { permission_key: string }[]).map((entry) => entry.permission_key),
      ]),
    );

    // An admin already holds is_admin() on everything the catalogue covers, so
    // every key restates existing access rather than adding any.
    const { count } = await admin.from("permissions").select("key", { count: "exact", head: true });
    expect(bySlug.get("admin")).toHaveLength(count ?? 0);
    expect(bySlug.get("super_admin")).toHaveLength(count ?? 0);

    // The others hold none. Seeding them with near-matching keys would either
    // describe them wrongly or, because these permissions are real, widen what
    // they can reach — a receptionist gaining documents because "patients.view"
    // looked close enough.
    for (const slug of ["doctor", "client", "finance_manager", "lab", "receptionist"]) {
      expect(bySlug.get(slug) ?? [], `${slug} should hold no matrix permissions`).toEqual([]);
    }
  });

  it("offers no permission that would let anyone but a vet author a clinical record", async () => {
    const { data } = await admin.from("permissions").select("key");
    const keys = (data ?? []).map((row) => row.key as string);

    // CLAUDE.md §11: diagnosis and treatment stay with the attending
    // veterinarian. A checkbox that appeared to hand that to a receptionist
    // would be the most dangerous thing on this screen.
    expect(keys).toContain("clinical.view");
    expect(keys).not.toContain("clinical.manage");
  });

  it("does not let a permission author a clinical record either", async () => {
    const { data: everyPermission } = await admin.from("permissions").select("key");
    const roleId = await makeRole(
      orgA,
      `clinicalwriter${RUN}`,
      (everyPermission ?? []).map((row) => row.key as string),
    );
    const holder = await signedInHolder(`clinicalwriter${RUN}`, roleId, orgA);

    const { data: pet } = await admin
      .from("pets")
      .insert({
        organization_id: orgA,
        client_id: (
          await admin
            .from("clients")
            .insert({ organization_id: orgA, full_name: `Owner ${RUN}`, phone: `+880194${RUN}0` })
            .select("id")
            .single()
        ).data!.id,
        name: `Patient ${RUN}`,
        species_id: (await admin.from("species").select("id").limit(1).single()).data!.id,
      })
      .select("id")
      .single();

    const { error } = await holder
      .from("vaccinations")
      .insert({ organization_id: orgA, pet_id: pet!.id, vaccine_name: `Nope ${RUN}`, administered_on: "2026-01-01" });

    expect(error).not.toBeNull();
  });

  it("has not widened what a receptionist can reach", async () => {
    const reception = await createUserWithRole(`custom-reception-${RUN}`, "receptionist", orgA);
    const receptionist = await signedInClient(reception.email);

    // Unchanged from before permissions existed: the front desk does not read
    // the money. If this ever passes, the additive policies stopped being
    // additive.
    const { data } = await receptionist.from("invoices").select("id");
    expect(data ?? []).toEqual([]);
  });
});

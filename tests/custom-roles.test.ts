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

  // A built-in role's name and permissions ARE editable by any admin now
  // (20261007000100) — deliberately, and covered in "editing a built-in
  // role" below. What stays refused is the one escalation that section is
  // named for: a permission cannot be used to reach role administration
  // itself, and a role's identity cannot move.
  it("still refuses to let a permission open role administration", async () => {
    const roleId = await makeRole(orgA, `wouldbeadmin${RUN}`, ["team.view"]);
    const holder = await signedInHolder(`wouldbeadmin${RUN}`, roleId, orgA);

    const { data: builtIn } = await admin.from("roles").select("id").eq("slug", "receptionist").single();

    const renamed = await holder.from("roles").update({ name: "Renamed" }).eq("id", builtIn!.id).select("id");
    expect(renamed.data ?? []).toEqual([]);

    const regranted = await holder
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

    // The four staff roles hold exactly the keys whose policies they already
    // satisfied before the matrix existed (20261006000100). The sets are short
    // on purpose: a key is here only when every table and command it unlocks
    // was already reachable through that role's own policies, so none of them
    // widened anything. Change one of these lists and you are changing what
    // that role can do, not what the screen says about it.
    const expected: Record<string, string[]> = {
      doctor: [
        "appointments.manage",
        "appointments.view",
        "billing.view",
        "clients.manage",
        "clients.view",
        "clinical.view",
        "patients.manage",
        "patients.view",
      ],
      receptionist: [
        "appointments.manage",
        "appointments.view",
        "clients.view",
        "doctors.view",
        "notifications.view",
        "patients.view",
        "preventive.view",
        "services.view",
      ],
      finance_manager: ["appointments.view", "billing.view", "clients.view", "services.view"],
      lab: ["appointments.view", "clients.view", "patients.view"],
    };

    for (const [slug, keys] of Object.entries(expected)) {
      expect([...(bySlug.get(slug) ?? [])].sort(), `${slug}'s permissions`).toEqual(keys);
    }

    // Deliberately absent, and the reason each is absent:
    //   clinical.view for lab/receptionist — it unlocks SOAP notes and
    //   prescriptions, which neither may read;
    //   billing.manage for finance_manager — they record a payment, they do
    //   not edit one afterwards;
    //   notifications.manage for receptionist — enquiries, not templates.
    expect(bySlug.get("lab")).not.toContain("clinical.view");
    expect(bySlug.get("receptionist")).not.toContain("clinical.view");
    expect(bySlug.get("receptionist")).not.toContain("notifications.manage");
    expect(bySlug.get("finance_manager")).not.toContain("billing.manage");

    // A client's access is their own records — owns_client() — not a
    // permission the practice grants.
    expect(bySlug.get("client") ?? []).toEqual([]);
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

describe("editing a built-in role", () => {
  /**
   * Restored inside the same test, in try/finally, regardless of pass or
   * fail. There is one Lab row for the whole platform (fileParallelism is off
   * in vitest.config.ts specifically so suites don't step on shared state
   * like this one), and every other file that asserts what Lab holds —
   * routes.test.ts, permission-matrix.test.ts, this file's own "the built-in
   * roles still mean what they meant" — must see it exactly as seeded when
   * its turn comes.
   */
  it("takes effect for every practice, not just the editor's own", async () => {
    const { data: before } = await admin
      .from("roles")
      .select("id, name, description, slug, is_system, organization_id, role_permissions(permission_key)")
      .eq("slug", "lab")
      .single();
    const labId = before!.id as string;
    const originalKeys = (before!.role_permissions as { permission_key: string }[]).map((r) => r.permission_key);

    // orgA's admin — unconnected to Lab's "home", because it has none. A
    // built-in role belongs to every practice equally.
    const labInOrgB = await createUserWithRole(`lab-editme-${RUN}`, "lab", orgB);
    const labUser = await signedInClient(labInOrgB.email);

    // Not granted by the seed (20261006000100): reading a vaccination
    // schedule is preventive.view, not preventive.manage, and Lab holds
    // neither preventive key.
    const before_write = await labUser
      .from("vaccination_schedules")
      .insert({ organization_id: orgB, vaccine_name: `Should fail ${RUN}`, interval_value: 1, interval_unit: "years" });
    expect(before_write.error).not.toBeNull();

    try {
      const { data: renamed, error: renameError } = await adminA
        .from("roles")
        .update({ name: "Laboratory", description: "Diagnostics." })
        .eq("id", labId)
        .select("id, name, is_system, organization_id, slug")
        .single();
      expect(renameError).toBeNull();
      expect(renamed).toMatchObject({ name: "Laboratory", is_system: true, organization_id: null, slug: "lab" });

      const { error: clearError } = await adminA.from("role_permissions").delete().eq("role_id", labId);
      expect(clearError).toBeNull();
      const { error: grantError } = await adminA
        .from("role_permissions")
        .insert([...originalKeys, "preventive.manage"].map((permission_key) => ({ role_id: labId, permission_key })));
      expect(grantError).toBeNull();

      // The whole point: an orgA admin's edit to the shared Lab role just
      // changed what an orgB lab user may do, with no grant made in orgB.
      const { error: afterError } = await labUser
        .from("vaccination_schedules")
        .insert({ organization_id: orgB, vaccine_name: `Should work ${RUN}`, interval_value: 1, interval_unit: "years" });
      expect(afterError).toBeNull();
    } finally {
      await admin.from("roles").update({ name: before!.name, description: before!.description }).eq("id", labId);
      await admin.from("role_permissions").delete().eq("role_id", labId);
      if (originalKeys.length > 0) {
        await admin
          .from("role_permissions")
          .insert(originalKeys.map((permission_key) => ({ role_id: labId, permission_key })));
      }
    }
  });

  it("keeps a role's identity fixed no matter who asks", async () => {
    const { data: doctorRole } = await admin.from("roles").select("id").eq("slug", "doctor").single();

    const attempts = [
      { slug: "veterinarian" },
      { is_system: false },
      { organization_id: orgA },
    ];

    for (const change of attempts) {
      // The service role bypasses RLS, but not a BEFORE UPDATE trigger — this
      // is checked at the table, not the policy.
      const { error } = await admin.from("roles").update(change).eq("id", doctorRole!.id);
      expect(error, `${JSON.stringify(change)} should be refused`).not.toBeNull();
    }

    const { data: unchanged } = await admin
      .from("roles")
      .select("slug, is_system, organization_id")
      .eq("id", doctorRole!.id)
      .single();
    expect(unchanged).toMatchObject({ slug: "doctor", is_system: true, organization_id: null });
  });

  it("still refuses anyone who is not an admin", async () => {
    const nonAdmin = await createUserWithRole(`lab-guard-${RUN}`, "lab", orgA);
    const nonAdminDb = await signedInClient(nonAdmin.email);

    const { data: labRole } = await admin.from("roles").select("id").eq("slug", "lab").single();

    const { data, error } = await nonAdminDb.from("roles").update({ name: "Hijacked" }).eq("id", labRole!.id).select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { error: grantError } = await nonAdminDb
      .from("role_permissions")
      .insert({ role_id: labRole!.id, permission_key: "settings.manage" });
    expect(grantError).not.toBeNull();
  });
});

describe("deleting a built-in role", () => {
  /**
   * `deleteRoleAction` refuses while anyone holds a role, and for a built-in
   * one that count is asked without an organization filter — see its comment
   * in src/features/roles/actions.ts. That count-then-refuse branch is plain
   * application logic, not a database policy, so — like the same guard on a
   * custom role, which had no test before this one either — it is not
   * exercised here; there is no harness in this suite for invoking a Next.js
   * server action directly. What IS a policy, and is covered below, is that
   * the delete itself (whichever role reaches it) is refused to anyone but an
   * admin, and succeeds through the exact query shape the action issues.
   */
  it("goes through for a built-in role nobody holds, and can be put back", async () => {
    const { data: before } = await admin
      .from("roles")
      .select("id, deleted_at")
      .eq("slug", "super_admin")
      .single();
    expect(before!.deleted_at).toBeNull();

    try {
      // The exact shape deleteRoleAction issues: no organization_id filter,
      // relying on roles_update (loosened for system roles by 20261007000100).
      const { data, error } = await adminA
        .from("roles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", before!.id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();

      expect(error).toBeNull();
      expect(data?.id).toBe(before!.id);

      const { data: gone } = await admin.from("roles").select("deleted_at").eq("id", before!.id).single();
      expect(gone!.deleted_at).not.toBeNull();
    } finally {
      await admin.from("roles").update({ deleted_at: null }).eq("id", before!.id);
    }

    const { data: restored } = await admin.from("roles").select("deleted_at").eq("id", before!.id).single();
    expect(restored!.deleted_at).toBeNull();
  });

  it("still refuses anyone who is not an admin", async () => {
    const nonAdmin = await createUserWithRole(`delete-guard-${RUN}`, "lab", orgA);
    const nonAdminDb = await signedInClient(nonAdmin.email);

    const { data: labRole } = await admin.from("roles").select("id").eq("slug", "lab").single();

    const { data, error } = await nonAdminDb
      .from("roles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", labRole!.id)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: untouched } = await admin.from("roles").select("deleted_at").eq("id", labRole!.id).single();
    expect(untouched!.deleted_at).toBeNull();
  });
});

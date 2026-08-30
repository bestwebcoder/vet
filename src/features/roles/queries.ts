import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the Roles screen.
 *
 * Everything here runs through the signed-in administrator's client, so the
 * roles that come back are the system ones plus their own practice's — never
 * another practice's, and not because this file filters carefully but because
 * the policies do.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type RoleSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** A built-in role: describable, assignable, never editable. */
  isSystem: boolean;
  permissions: string[];
  /** How many people in this practice currently hold it. */
  holderCount: number;
};

type RoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  role_permissions: { permission_key: string }[] | null;
};

/**
 * Every role this practice can assign: the built-ins, plus its own.
 *
 * `client` is left out. It is not a job at the practice — it is what a pet
 * owner is — and offering it beside Receptionist on a staff screen invites
 * granting somebody the wrong one.
 */
export async function listRoles(organizationId: string): Promise<Result<RoleSummary[]>> {
  const supabase = await createClient();

  const [{ data: roles, error }, { data: grants, error: grantError }] = await Promise.all([
    supabase
      .from("roles")
      .select("id, slug, name, description, is_system, role_permissions(permission_key)")
      .is("deleted_at", null)
      .or(`organization_id.eq.${organizationId},is_system.eq.true`)
      .order("is_system", { ascending: false })
      .order("name"),
    supabase
      .from("user_roles")
      .select("role_id")
      .eq("organization_id", organizationId)
      .is("revoked_at", null),
  ]);

  if (error || grantError) {
    console.error("[roles] list failed", error ?? grantError);
    return { status: "error" };
  }

  const holders = new Map<string, number>();
  for (const grant of grants ?? []) {
    holders.set(grant.role_id, (holders.get(grant.role_id) ?? 0) + 1);
  }

  return {
    status: "ok",
    data: (roles as RoleRow[])
      .filter((role) => role.slug !== "client")
      .map((role) => ({
        id: role.id,
        slug: role.slug,
        name: role.name,
        description: role.description,
        isSystem: role.is_system,
        permissions: (role.role_permissions ?? []).map((entry) => entry.permission_key),
        holderCount: holders.get(role.id) ?? 0,
      })),
  };
}

/** One role, for the editor. Null when it is not this practice's to see. */
export async function getRole(roleId: string): Promise<Result<RoleSummary | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("id, slug, name, description, is_system, role_permissions(permission_key)")
    .eq("id", roleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[roles] get failed", error);
    return { status: "error" };
  }

  if (!data) return { status: "ok", data: null };

  const role = data as RoleRow;

  return {
    status: "ok",
    data: {
      id: role.id,
      slug: role.slug,
      name: role.name,
      description: role.description,
      isSystem: role.is_system,
      permissions: (role.role_permissions ?? []).map((entry) => entry.permission_key),
      holderCount: 0,
    },
  };
}

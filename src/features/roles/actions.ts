"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { isPermissionKey, withImpliedViews } from "@/features/permissions/catalogue";
import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { roleSchema, slugForRole } from "@/lib/validation/role";

/**
 * Writes for the Roles screen.
 *
 * Administrator-only, and not by convention: the policies added in
 * 20260930000100_permissions.sql (loosened for system roles by
 * 20261007000100) refuse an insert or update on `roles` and `role_permissions`
 * from anyone who is not an admin of the practice that owns the role — or, for
 * a built-in role, an admin of any practice, since a built-in role belongs to
 * all of them. `requireRole` here is the clear error message, not the
 * boundary.
 *
 * A role's identity — its slug, is_system and organization_id — is fixed by a
 * trigger in the same migration, not by anything in this file: what is left
 * for createRoleAction and updateRoleAction to write is exactly name,
 * description and the permission matrix.
 *
 * Why no permission gates this file: a permission that let someone edit roles
 * would let them grant themselves every other permission, which is not a
 * delegation, it is a way around the matrix. See
 * ROLE_ADMINISTRATION_IS_ADMIN_ONLY in the catalogue.
 */

async function adminOrganization() {
  const user = await requireRole("admin", "super_admin");
  return { user, organizationId: user.organizationIds[0] ?? null };
}

/**
 * The permission keys ticked on the form, filtered to ones that exist.
 *
 * A key not in the catalogue is dropped rather than rejected: it can only come
 * from a tampered form, and nothing in the catalogue depends on telling
 * whoever sent it which keys are real.
 */
function permissionsFrom(formData: FormData): string[] {
  const chosen = formData
    .getAll("permissions")
    .filter((value): value is string => typeof value === "string")
    .filter(isPermissionKey);

  return withImpliedViews(chosen);
}

/** Replaces a role's permissions with exactly this set. */
async function writePermissions(roleId: string, keys: string[]): Promise<FormState | null> {
  const supabase = await createClient();

  const { error: clearError } = await supabase.from("role_permissions").delete().eq("role_id", roleId);
  if (clearError) {
    return failure("roles", clearError, "We could not save these permissions just now. Please try again.");
  }

  if (keys.length === 0) return null;

  const { error } = await supabase
    .from("role_permissions")
    .insert(keys.map((key) => ({ role_id: roleId, permission_key: key })));

  if (error) {
    return failure("roles", error, "We could not save these permissions just now. Please try again.");
  }

  return null;
}

export async function createRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { organizationId } = await adminOrganization();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = roleSchema.safeParse({
    name: text(formData, "name") ?? "",
    description: text(formData, "description") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: { name: parsed.error.issues.map((issue) => issue.message) },
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .insert({
      name: parsed.data.name,
      slug: slugForRole(parsed.data.name),
      description: parsed.data.description,
      organization_id: organizationId,
      is_system: false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "This practice already has a role with that name.",
        fieldErrors: { name: ["Already in use"] },
      };
    }

    return failure("roles", error, "We could not create that role just now. Please try again.");
  }

  const permissionError = await writePermissions(data.id, permissionsFrom(formData));
  if (permissionError) return permissionError;

  revalidatePath("/admin/users");
  return { status: "success", message: `${parsed.data.name} created.`, id: data.id };
}

export async function updateRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { organizationId } = await adminOrganization();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const roleId = text(formData, "roleId");
  if (!roleId) return { status: "error", message: "We could not tell which role to save." };

  const parsed = roleSchema.safeParse({
    name: text(formData, "name") ?? "",
    description: text(formData, "description") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: { name: parsed.error.issues.map((issue) => issue.message) },
    };
  }

  const supabase = await createClient();

  // No organization_id filter: a system role's is null, and would never match
  // one. The policy (roles_update) is the real boundary — an admin of any
  // practice for a built-in role, an admin of the owning practice for its
  // own — so the query only needs to ask for the row.
  //
  // The slug is left alone. It is what a grant already made against this role
  // resolves through, and renaming "Nurse" to "Senior nurse" is a change of
  // label, not a change of role.
  const { data, error } = await supabase
    .from("roles")
    .update({ name: parsed.data.name, description: parsed.data.description })
    .eq("id", roleId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "This practice already has a role with that name.",
        fieldErrors: { name: ["Already in use"] },
      };
    }

    return failure("roles", error, "We could not save that role just now. Please try again.");
  }

  // Nothing came back: a system role, or another practice's. The policies
  // refused it, which is the answer.
  if (!data) {
    return { status: "error", message: "That role cannot be edited." };
  }

  const permissionError = await writePermissions(roleId, permissionsFrom(formData));
  if (permissionError) return permissionError;

  revalidatePath("/admin/users");
  return { status: "success", message: `${parsed.data.name} saved.`, id: roleId };
}

/**
 * Soft-deletes a role — a practice's own, or, since 20261007000100, a
 * built-in one.
 *
 * Refused while anyone still holds it, for a built-in role exactly as for a
 * custom one: the alternative — revoking everybody's grant as a side effect —
 * would take away access from a screen that asked about one role, and whoever
 * pressed it would find out when a colleague could not sign in. For a custom
 * role that is this practice's colleagues; for a built-in role, shared by
 * every practice on the platform, it is every practice's. So the count for a
 * built-in role is asked without an organization filter — the question is not
 * "does anyone in my practice hold this" but "does anyone anywhere."
 */
export async function deleteRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { organizationId } = await adminOrganization();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const roleId = text(formData, "roleId");
  if (!roleId) return { status: "error", message: "We could not tell which role to delete." };

  const supabase = await createClient();

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("is_system")
    .eq("id", roleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (roleError) {
    return failure("roles", roleError, "We could not delete that role just now. Please try again.");
  }
  if (!role) return { status: "error", message: "That role cannot be deleted." };

  let holderQuery = supabase
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role_id", roleId)
    .is("revoked_at", null);
  if (!role.is_system) {
    holderQuery = holderQuery.eq("organization_id", organizationId);
  }
  const { count, error: countError } = await holderQuery;

  if (countError) {
    return failure("roles", countError, "We could not delete that role just now. Please try again.");
  }

  if ((count ?? 0) > 0) {
    const scope = role.is_system ? ", across every practice," : "";
    return {
      status: "error",
      message:
        count === 1
          ? `One person${scope} still holds this role. Move them to another role first.`
          : `${count} people${scope} still hold this role. Move them to another role first.`,
    };
  }

  // No organization_id filter: a system role's is null. The policy
  // (roles_update, which also governs this soft delete) is the boundary.
  const { data, error } = await supabase
    .from("roles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", roleId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("roles", error, "We could not delete that role just now. Please try again.");
  }

  if (!data) return { status: "error", message: "That role cannot be deleted." };

  revalidatePath("/admin/users");
  return { status: "success", message: "Role deleted." };
}

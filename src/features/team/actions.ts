"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { setTeamRoleSchema } from "@/lib/validation/team";

/**
 * Grants, changes or removes one role for one person within the admin's own
 * organization — the action behind /admin/settings' "Team & roles" section.
 *
 * "none" only revokes; anything else revokes whatever was active and grants
 * the new role, same soft-revoke shape as deactivateDoctorAction and
 * deactivateClientAction. Granting doctor or client also needs that role's
 * own table row to exist before the rest of the app (which assumes a
 * doctors/clients row backs the role) can do anything with the account — a
 * prior deactivation from /admin/doctors or /admin/clients left that row
 * soft-deleted rather than gone, so it is reactivated in place rather than
 * duplicated.
 */
export async function setTeamRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = setTeamRoleSchema.safeParse({
    userId: text(formData, "userId") ?? "",
    role: text(formData, "role") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { userId, role } = parsed.data;

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: revokeError } = await supabase
    .from("user_roles")
    .update({ revoked_at: now })
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .is("revoked_at", null);

  if (revokeError) {
    return failure("team", revokeError, "We could not update this person's role just now. Please try again.");
  }

  if (role === "none") {
    revalidatePath("/admin/team");
    return { status: "success", message: "Role removed." };
  }

  const { data: roleRow, error: roleLookupError } = await supabase
    .from("roles")
    .select("id")
    .eq("slug", role)
    .single();
  if (roleLookupError || !roleRow) {
    return { status: "error", message: "That role is not configured for this practice." };
  }

  if (role === "client") {
    const { data: profile } = await supabase.from("users").select("full_name, phone").eq("id", userId).single();
    if (!profile?.phone) {
      return {
        status: "error",
        message: "This account has no phone number on file. Add them from Admin → Clients instead, which collects one.",
      };
    }

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { error: clientError } = existingClient
      ? await supabase.from("clients").update({ deleted_at: null }).eq("id", existingClient.id)
      : await supabase
          .from("clients")
          .insert({ user_id: userId, organization_id: organizationId, full_name: profile.full_name, phone: profile.phone });

    if (clientError) {
      return failure("team", clientError, "We could not set up the client record just now. Please try again.");
    }
  }

  if (role === "doctor") {
    const { data: existingDoctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { error: doctorError } = existingDoctor
      ? await supabase.from("doctors").update({ deleted_at: null }).eq("id", existingDoctor.id)
      : await supabase.from("doctors").insert({ user_id: userId, organization_id: organizationId });

    if (doctorError) {
      return failure("team", doctorError, "We could not set up the doctor record just now. Please try again.");
    }
  }

  const { error: grantError } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role_id: roleRow.id, organization_id: organizationId });

  if (grantError) {
    return failure("team", grantError, "We could not grant that role just now. Please try again.");
  }

  revalidatePath("/admin/team");
  revalidatePath("/admin/doctors");
  revalidatePath("/admin/clients");
  return { status: "success", message: "Role updated." };
}

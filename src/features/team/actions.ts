"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRole } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteTeamMemberSchema, setTeamRoleSchema, type AssignableRoleSlug } from "@/lib/validation/team";

/**
 * Grants one role to one already-existing user within organizationId,
 * creating or reactivating that role's own table row first where the rest
 * of the app needs one to exist (doctors, clients) — shared by
 * setTeamRoleAction (an existing person, role changing) and
 * inviteTeamMemberAction (a brand new person, role set once on arrival).
 * Assumes any previously active role has already been revoked by the
 * caller; "none" is not a valid input here, only a real role.
 */
async function grantTeamRole(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  role: Exclude<AssignableRoleSlug, "none">,
): Promise<FormState | null> {
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

  if (role === "admin" || role === "finance_manager" || role === "lab" || role === "receptionist") {
    // Every clinic-side, non-doctor role needs a staff row backing it, or
    // deactivating them later (role -> "none") drops them out of
    // getTeamRoster entirely: neither an active member nor a pending staff
    // record, unreachable from this page afterwards. Doctor/client each
    // already get their own backing row above for the same reason.
    const { data: existingStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { error: staffError } = existingStaff
      ? await supabase.from("staff").update({ deleted_at: null }).eq("id", existingStaff.id)
      : await supabase.from("staff").insert({ user_id: userId, organization_id: organizationId });

    if (staffError) {
      return failure("team", staffError, "We could not set up the staff record just now. Please try again.");
    }
  }

  const { error: grantError } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role_id: roleRow.id, organization_id: organizationId });

  if (grantError) {
    return failure("team", grantError, "We could not grant that role just now. Please try again.");
  }

  return null;
}

/**
 * Grants, changes or removes one role for one person within the admin's own
 * organization — the action behind /admin/users's role select.
 *
 * "none" only revokes; anything else revokes whatever was active and grants
 * the new role, same soft-revoke shape as deactivateDoctorAction and
 * deactivateClientAction.
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
    revalidatePath("/admin/users");
    return { status: "success", message: "Role removed." };
  }

  const grantResult = await grantTeamRole(supabase, userId, organizationId, role);
  if (grantResult) return grantResult;

  revalidatePath("/admin/users");
  revalidatePath("/admin/doctors");
  revalidatePath("/admin/clients");
  return { status: "success", message: "Role updated." };
}

/**
 * Adds a brand new person to the practice — the "Add team member" flow
 * /admin/users was missing entirely: every other route onto the roster
 * (self-registration, inviteDoctorAction) provisions a specific role
 * automatically, and demo seed data aside, nothing created the "registered,
 * no role yet" account this page exists to manage until now.
 *
 * A real Supabase Auth invite, same shape as inviteDoctorAction — the
 * service role is used for that one call only, everything after runs
 * through the admin's own RLS-scoped session.
 */
export async function inviteTeamMemberAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = inviteTeamMemberSchema.safeParse({
    fullName: text(formData, "fullName") ?? "",
    email: text(formData, "email") ?? "",
    phone: text(formData, "phone") ?? null,
    jobTitle: text(formData, "jobTitle") ?? null,
    role: text(formData, "role") ?? "none",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { fullName, email, phone, jobTitle, role } = parsed.data;

  const serviceClient = createServiceClient();
  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone },
  });

  if (inviteError) {
    if (inviteError.code === "email_exists") {
      return {
        status: "error",
        message: "An account with this email already exists.",
        fieldErrors: { email: ["Already in use"] },
      };
    }
    return failure("team", inviteError, "We could not send that invitation just now. Please try again.");
  }

  const supabase = await createClient();
  const { error: staffError } = await supabase
    .from("staff")
    .insert({ user_id: invited.user.id, organization_id: organizationId, job_title: jobTitle });

  if (staffError) {
    return failure("team", staffError, "We could not add this person just now. Please try again.");
  }

  if (role !== "none") {
    const grantResult = await grantTeamRole(supabase, invited.user.id, organizationId, role);
    if (grantResult) return grantResult;
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/doctors");
  revalidatePath("/admin/clients");
  return { status: "success", message: `Invitation sent to ${email}.` };
}

/**
 * Removes a pending/staff entry from the roster — distinct from "none" on
 * the role select, which only revokes the role and leaves them staff. Soft,
 * like every other removal in this app (deactivateDoctorAction,
 * deactivateClientAction): the database revokes DELETE from the app's role
 * on every table on purpose (20260820000100_core_schema.sql — "clinical
 * history is soft-deleted via deleted_at and must never be destroyed"), so
 * this sets staff.deleted_at rather than deleting the row, and
 * restoreTeamMemberAction is the way back.
 */
export async function deleteTeamMemberAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const userId = text(formData, "userId");
  if (!userId) return { status: "error", message: "We could not tell who to remove." };

  const supabase = await createClient();
  const now = new Date().toISOString();

  const [{ error: revokeError }, { error: staffError }] = await Promise.all([
    supabase
      .from("user_roles")
      .update({ revoked_at: now })
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .is("revoked_at", null),
    supabase.from("staff").update({ deleted_at: now }).eq("user_id", userId).eq("organization_id", organizationId),
  ]);

  if (revokeError || staffError) {
    return failure("team", revokeError ?? staffError, "We could not remove this person just now. Please try again.");
  }

  revalidatePath("/admin/users");
  return { status: "success", message: "Removed from the team." };
}

/** Undoes deleteTeamMemberAction — the staff row is never actually gone, only marked removed. */
export async function restoreTeamMemberAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const userId = text(formData, "userId");
  if (!userId) return { status: "error", message: "We could not tell who to restore." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({ deleted_at: null })
    .eq("user_id", userId)
    .eq("organization_id", organizationId);

  if (error) {
    return failure("team", error, "We could not restore this person just now. Please try again.");
  }

  revalidatePath("/admin/users");
  return { status: "success", message: "Restored to the team." };
}

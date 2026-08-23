"use server";

import { revalidatePath } from "next/cache";

import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * §7.8's and §8.6's permission flags — admin only, enforced by
 * guard_doctor_permission_update() as well as row level security. A doctor
 * can never grant either to themselves, even by editing their own profile.
 */

export async function toggleBillingPermissionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const doctorId = text(formData, "doctorId");
  const canManageBilling = text(formData, "canManageBilling") === "true";
  if (!doctorId) return { status: "error", message: "We could not tell which doctor to update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .update({ can_manage_billing: !canManageBilling })
    .eq("id", doctorId)
    .select("id")
    .maybeSingle();

  if (error) return failure("doctors", error, "We could not update that permission just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this doctor." };

  revalidatePath("/admin/billing");
  return {
    status: "success",
    message: canManageBilling ? "Billing permission removed." : "Billing permission granted.",
  };
}

export async function toggleReportsPermissionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const doctorId = text(formData, "doctorId");
  const canViewReports = text(formData, "canViewReports") === "true";
  if (!doctorId) return { status: "error", message: "We could not tell which doctor to update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .update({ can_view_reports: !canViewReports })
    .eq("id", doctorId)
    .select("id")
    .maybeSingle();

  if (error) return failure("doctors", error, "We could not update that permission just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this doctor." };

  revalidatePath("/admin/reports");
  return {
    status: "success",
    message: canViewReports ? "Report access removed." : "Report access granted.",
  };
}

/** At most one lead doctor per practice (enforced by a partial unique index) — featured on the public site. */
export async function toggleLeadDoctorAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const doctorId = text(formData, "doctorId");
  const isLeadDoctor = text(formData, "isLeadDoctor") === "true";
  if (!doctorId) return { status: "error", message: "We could not tell which doctor to update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .update({ is_lead_doctor: !isLeadDoctor })
    .eq("id", doctorId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Another doctor is already marked as lead. Remove that one first.",
      };
    }
    return failure("doctors", error, "We could not update that just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this doctor." };

  revalidatePath("/admin/doctors");
  revalidatePath("/doctors");
  revalidatePath("/");
  return {
    status: "success",
    message: isLeadDoctor ? "No longer marked as lead doctor." : "Marked as lead doctor.",
  };
}

"use server";

import { revalidatePath } from "next/cache";

import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * §7.8's permission flag — admin only, enforced by
 * guard_doctor_billing_permission_update() as well as row level security.
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

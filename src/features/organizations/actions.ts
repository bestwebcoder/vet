"use server";

import { revalidatePath } from "next/cache";

import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { optionalText, optionalTime } from "@/lib/validation/common";

/**
 * §7.5's "payment information" on the invoice PDF — a single admin-editable
 * field, not a general organization-settings screen (still Phase 10).
 */

export async function updatePaymentInstructionsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const organizationId = text(formData, "organizationId");
  if (!organizationId) return { status: "error", message: "We could not tell which practice this is for." };

  const paymentInstructions = optionalText(1000, "Payment instructions").safeParse(
    text(formData, "paymentInstructions") ?? "",
  );
  if (!paymentInstructions.success) {
    return { status: "error", message: "Keep payment instructions under 1000 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ payment_instructions: paymentInstructions.data })
    .eq("id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save that just now. Please try again.");
  }

  revalidatePath("/admin/billing");
  return { status: "success", message: "Payment instructions saved." };
}

/**
 * §9.4's "practice-level defaults" — quiet hours defer sms/whatsapp/push
 * sends until the window ends; email is never deferred. Either bound left
 * blank disables quiet hours entirely.
 */
export async function updateQuietHoursAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const organizationId = text(formData, "organizationId");
  if (!organizationId) return { status: "error", message: "We could not tell which practice this is for." };

  const start = optionalTime("Start time").safeParse(text(formData, "quietHoursStart") ?? "");
  const end = optionalTime("End time").safeParse(text(formData, "quietHoursEnd") ?? "");
  if (!start.success || !end.success) {
    return { status: "error", message: "Choose valid start and end times, or leave both blank." };
  }
  if ((start.data === null) !== (end.data === null)) {
    return { status: "error", message: "Set both a start and an end time, or leave both blank." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ quiet_hours_start: start.data, quiet_hours_end: end.data })
    .eq("id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save quiet hours just now. Please try again.");
  }

  revalidatePath("/admin/notifications");
  return { status: "success", message: start.data ? "Quiet hours saved." : "Quiet hours disabled." };
}

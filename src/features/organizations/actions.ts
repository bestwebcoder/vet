"use server";

import { revalidatePath } from "next/cache";

import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { optionalText } from "@/lib/validation/common";

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

"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema } from "@/lib/validation/payment";

/**
 * Payment recording. `is_billing_manager` is enforced by row level
 * security. A payment that would overpay the invoice is refused here —
 * this is the DoD's "failed payment" state: a plain sentence, not a raw
 * database error, and nothing is written.
 */

export async function recordPaymentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  if (!invoiceId) return { status: "error", message: "We could not tell which invoice this payment is for." };

  const parsed = paymentSchema.safeParse({
    amountPaisa: text(formData, "amountPaisa") ?? "",
    method: text(formData, "method") ?? "",
    referenceNumber: text(formData, "referenceNumber") ?? "",
    notes: text(formData, "notes") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("organization_id, status, balance_paisa")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    return { status: "error", message: "That invoice could not be found." };
  }

  if (invoice.status === "draft" || invoice.status === "cancelled") {
    return {
      status: "error",
      message: "Payment failed: this invoice has not been issued, so there is nothing to pay.",
    };
  }

  if (parsed.data.amountPaisa > invoice.balance_paisa) {
    return {
      status: "error",
      message: "Payment failed: that amount is more than the remaining balance on this invoice.",
    };
  }

  const user = await getSessionUser();

  const { error } = await supabase.from("payments").insert({
    invoice_id: invoiceId,
    organization_id: invoice.organization_id,
    amount_paisa: parsed.data.amountPaisa,
    method: parsed.data.method,
    reference_number: parsed.data.referenceNumber,
    notes: parsed.data.notes,
    recorded_by: user?.id,
  });

  if (error) {
    return failure("payments", error, "Payment failed: we could not record this payment just now. Please try again.");
  }

  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/doctor/invoices/${invoiceId}`);
  revalidatePath("/admin/payments");
  revalidatePath("/admin/billing");
  revalidatePath("/client/invoices");

  return { status: "success", message: "Payment recorded." };
}

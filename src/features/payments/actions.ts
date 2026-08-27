"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { formatCurrency } from "@/lib/currency";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema, refundSchema } from "@/lib/validation/payment";

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

/**
 * Records a refund against one payment.
 *
 * Never edits the payment. What was taken and what was given back are separate
 * rows, so an invoice that was paid and then refunded still shows both, with
 * who did each and why (CLAUDE.md §6).
 *
 * The over-refund check here is for the message, not the guarantee: the
 * refunds_guard_amount trigger refuses it regardless, and would do so even if
 * this ran against stale numbers between the read and the insert.
 */
export async function recordRefundAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const paymentId = text(formData, "paymentId");
  if (!paymentId) return { status: "error", message: "We could not tell which payment to refund." };

  const parsed = refundSchema.safeParse({
    amountPaisa: text(formData, "amountPaisa") ?? "",
    method: text(formData, "method") ?? "",
    reason: text(formData, "reason") ?? "",
    referenceNumber: text(formData, "referenceNumber") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, invoice_id, organization_id, amount_paisa, status")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    return { status: "error", message: "That payment could not be found." };
  }

  if (payment.status !== "completed") {
    return { status: "error", message: "Only a completed payment can be refunded." };
  }

  const { data: existing } = await supabase.from("refunds").select("amount_paisa").eq("payment_id", paymentId);
  const alreadyRefunded = (existing ?? []).reduce((total, row) => total + row.amount_paisa, 0);
  const refundable = payment.amount_paisa - alreadyRefunded;

  if (parsed.data.amountPaisa > refundable) {
    return {
      status: "error",
      message:
        refundable > 0
          ? `Refund failed: only ${formatCurrency(refundable)} of this payment is left to refund.`
          : "Refund failed: this payment has already been refunded in full.",
      fieldErrors: { amountPaisa: ["More than is left"] },
    };
  }

  const user = await getSessionUser();

  const { error } = await supabase.from("refunds").insert({
    payment_id: paymentId,
    invoice_id: payment.invoice_id,
    organization_id: payment.organization_id,
    amount_paisa: parsed.data.amountPaisa,
    method: parsed.data.method,
    reason: parsed.data.reason,
    reference_number: parsed.data.referenceNumber,
    recorded_by: user?.id ?? null,
  });

  if (error) {
    return failure("payments", error, "We could not record that refund just now. Please try again.");
  }

  revalidatePath(`/admin/invoices/${payment.invoice_id}`);
  revalidatePath(`/doctor/invoices/${payment.invoice_id}`);
  revalidatePath("/admin/billing");
  revalidatePath("/admin/payments");
  return { status: "success", message: "Refund recorded." };
}

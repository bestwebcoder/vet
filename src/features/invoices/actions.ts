"use server";

import { revalidatePath } from "next/cache";

import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  invoiceCancelSchema,
  invoiceDiscountSchema,
  invoiceIssueSchema,
  invoiceItemSchema,
  invoiceItemToRow,
} from "@/lib/validation/invoice";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

/**
 * Invoice writes. `is_billing_manager` (admin, or a doctor with
 * `can_manage_billing`) is enforced by row level security — nothing here
 * re-implements that check, only reports a friendly message when it fails.
 */

/** The guard_issued_invoice_items trigger raises a plain exception (SQLSTATE P0001). */
function issuedInvoiceError(): FormState {
  return {
    status: "error",
    message: "This invoice has already been issued and its items can no longer be changed.",
  };
}

function revalidateInvoicePaths(invoiceId: string, appointmentId: string | null, petId: string | null) {
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/doctor/invoices/${invoiceId}`);
  if (appointmentId) revalidatePath(`/doctor/appointments/${appointmentId}/invoice`);
  if (petId) {
    revalidatePath(`/doctor/patients/${petId}/billing`);
    revalidatePath(`/admin/patients/${petId}/billing`);
    revalidatePath(`/client/pets/${petId}/billing`);
  }
  revalidatePath("/admin/billing");
  revalidatePath("/client/invoices");
}

/** Generates a draft invoice from a completed appointment's service (+ the home-visit fee, if configured). */
export async function createInvoiceFromAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  if (!appointmentId) return { status: "error", message: "We could not tell which appointment this is for." };

  const supabase = await createClient();

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("organization_id, client_id, pet_id, visit_type, status, service:services (id, name, price_paisa, tax_rate_percent)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment) {
    return { status: "error", message: "That appointment could not be found." };
  }

  if (appointment.status !== "completed") {
    return { status: "error", message: "An invoice can only be generated once the visit is completed." };
  }

  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    return { status: "success", id: existing.id, message: "An invoice already exists for this visit." };
  }

  const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service;
  if (!service) {
    return { status: "error", message: "This appointment has no service to invoice." };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      organization_id: appointment.organization_id,
      client_id: appointment.client_id,
      pet_id: appointment.pet_id,
      appointment_id: appointmentId,
    })
    .select("id")
    .single();

  if (invoiceError) {
    return failure("invoices", invoiceError, "We could not create an invoice just now. Please try again.");
  }

  const items = [
    {
      invoice_id: invoice.id,
      service_id: service.id,
      description: service.name,
      quantity: 1,
      unit_price_paisa: service.price_paisa,
      tax_rate_percent: service.tax_rate_percent,
      line_total_paisa: service.price_paisa,
      sort_order: 10,
    },
  ];

  if (appointment.visit_type === "home") {
    const { data: feeService } = await supabase
      .from("services")
      .select("id, name, price_paisa, tax_rate_percent")
      .eq("organization_id", appointment.organization_id)
      .eq("is_home_visit_fee", true)
      .eq("is_active", true)
      .maybeSingle();

    if (feeService) {
      items.push({
        invoice_id: invoice.id,
        service_id: feeService.id,
        description: feeService.name,
        quantity: 1,
        unit_price_paisa: feeService.price_paisa,
        tax_rate_percent: feeService.tax_rate_percent,
        line_total_paisa: feeService.price_paisa,
        sort_order: 20,
      });
    }
  }

  const { error: itemsError } = await supabase.from("invoice_items").insert(items);
  if (itemsError) {
    return failure("invoice_items", itemsError, "The invoice was created, but its items could not be added. Please try again.");
  }

  revalidateInvoicePaths(invoice.id, appointmentId, appointment.pet_id);
  return { status: "success", id: invoice.id, message: "Invoice created." };
}

function readItemForm(formData: FormData) {
  return {
    serviceId: text(formData, "serviceId") ?? "",
    description: text(formData, "description") ?? "",
    quantity: text(formData, "quantity") ?? "1",
    unitPricePaisa: text(formData, "unitPricePaisa") ?? "",
    taxRatePercent: text(formData, "taxRatePercent") ?? "",
  };
}

export async function addInvoiceItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  if (!invoiceId) return { status: "error", message: "We could not tell which invoice this is for." };

  const parsed = invoiceItemSchema.safeParse(readItemForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("invoice_items").insert({ invoice_id: invoiceId, ...invoiceItemToRow(parsed.data) });

  if (error) {
    if (error.code === "P0001") return issuedInvoiceError();
    return failure("invoice_items", error, "We could not add that item just now. Please try again.");
  }

  revalidateInvoicePaths(invoiceId, null, null);
  return { status: "success", message: "Item added." };
}

export async function updateInvoiceItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const itemId = text(formData, "itemId");
  const invoiceId = text(formData, "invoiceId");
  if (!itemId || !invoiceId) return { status: "error", message: "We could not tell which item to update." };

  const parsed = invoiceItemSchema.safeParse(readItemForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .update(invoiceItemToRow(parsed.data))
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "P0001") return issuedInvoiceError();
    return failure("invoice_items", error, "We could not save those changes just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this item." };

  revalidateInvoicePaths(invoiceId, null, null);
  return { status: "success", message: "Changes saved." };
}

export async function removeInvoiceItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const itemId = text(formData, "itemId");
  const invoiceId = text(formData, "invoiceId");
  if (!itemId || !invoiceId) return { status: "error", message: "We could not tell which item to remove." };

  const supabase = await createClient();
  const { error } = await supabase.from("invoice_items").delete().eq("id", itemId);

  if (error) {
    if (error.code === "P0001") return issuedInvoiceError();
    return failure("invoice_items", error, "We could not remove that item just now. Please try again.");
  }

  revalidateInvoicePaths(invoiceId, null, null);
  return { status: "success", message: "Item removed." };
}

export async function updateDiscountAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  if (!invoiceId) return { status: "error", message: "We could not tell which invoice to update." };

  const parsed = invoiceDiscountSchema.safeParse({ discountPaisa: text(formData, "discountPaisa") ?? "0" });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ discount_paisa: parsed.data.discountPaisa })
    .eq("id", invoiceId)
    .select("id")
    .maybeSingle();

  if (error) return failure("invoices", error, "We could not save that discount just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this invoice." };

  revalidateInvoicePaths(invoiceId, null, null);
  return { status: "success", message: "Discount saved." };
}

export async function issueInvoiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  if (!invoiceId) return { status: "error", message: "We could not tell which invoice to issue." };

  const parsed = invoiceIssueSchema.safeParse({
    dueDate: text(formData, "dueDate") ?? "",
    notes: text(formData, "notes") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { data: items } = await supabase.from("invoice_items").select("id").eq("invoice_id", invoiceId);
  if (!items || items.length === 0) {
    return { status: "error", message: "Add at least one item before issuing this invoice." };
  }

  const dueDate =
    parsed.data.dueDate ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({
      status: "issued",
      issued_at: new Date().toISOString(),
      due_date: dueDate,
      notes: parsed.data.notes,
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id, pet_id, appointment_id")
    .maybeSingle();

  if (error) return failure("invoices", error, "We could not issue this invoice just now. Please try again.");
  if (!invoice) return { status: "error", message: "Only a draft invoice can be issued." };

  const pdfResult = await generateAndStoreInvoicePdf(invoiceId);
  if (pdfResult.status === "error") {
    // The invoice is issued either way — a failed PDF render can be retried.
    console.error("[invoices] pdf generation failed", pdfResult.error);
  }

  revalidateInvoicePaths(invoiceId, invoice.appointment_id, invoice.pet_id);
  return { status: "success", message: "Invoice issued." };
}

async function generateAndStoreInvoicePdf(invoiceId: string): Promise<{ status: "ok" } | { status: "error"; error: unknown }> {
  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, client_id, pet_id, subtotal_paisa, discount_paisa, tax_paisa, total_paisa,
       amount_paid_paisa, balance_paisa, issued_at, due_date, organization_id,
       client:clients (full_name, phone, address),
       pet:pets (name),
       items:invoice_items (description, quantity, unit_price_paisa, tax_rate_percent, line_total_paisa, sort_order)`,
    )
    .eq("id", invoiceId)
    .single();

  if (error || !invoice) return { status: "error", error };

  try {
    const buffer = await renderInvoicePdf(invoice, supabase);
    const path = `${invoice.client_id}/${invoiceId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("invoice-pdfs")
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) return { status: "error", error: uploadError };

    await supabase.from("invoices").update({ pdf_path: path }).eq("id", invoiceId);
    return { status: "ok" };
  } catch (renderError) {
    return { status: "error", error: renderError };
  }
}

export async function cancelInvoiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  if (!invoiceId) return { status: "error", message: "We could not tell which invoice to cancel." };

  const parsed = invoiceCancelSchema.safeParse({ cancellationReason: text(formData, "cancellationReason") ?? "" });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: parsed.data.cancellationReason,
    })
    .eq("id", invoiceId)
    .neq("status", "paid")
    .select("id, pet_id, appointment_id")
    .maybeSingle();

  if (error) return failure("invoices", error, "We could not cancel this invoice just now. Please try again.");
  if (!data) return { status: "error", message: "A paid invoice cannot be cancelled." };

  revalidateInvoicePaths(invoiceId, data.appointment_id, data.pet_id);
  return { status: "success", message: "Invoice cancelled." };
}

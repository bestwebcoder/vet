import { formatCurrency } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";

/**
 * Invoice reads. subtotal/tax/total/paid/balance are always the database
 * trigger's numbers — nothing here recomputes them, the same way nothing in
 * `src/features/soap/queries.ts` recomputes a SOAP record's own fields.
 */

export type InvoiceItem = {
  id: string;
  serviceId: string | null;
  description: string;
  quantity: number;
  unitPricePaisa: number;
  unitPrice: string;
  taxRatePercent: number;
  lineTotalPaisa: number;
  lineTotal: string;
  sortOrder: number;
};

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "cancelled" | "refunded";

export type InvoiceDetail = {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  clientId: string;
  clientName: string;
  clientPhone: string;
  petId: string | null;
  petName: string | null;
  appointmentId: string | null;
  subtotalPaisa: number;
  discountPaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  amountPaidPaisa: number;
  balancePaisa: number;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  amountPaid: string;
  balance: string;
  issuedAt: string | null;
  dueDate: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  pdfPath: string | null;
  createdAt: string;
  items: InvoiceItem[];
};

const INVOICE_COLUMNS = `
  id, organization_id, invoice_number, status, client_id, pet_id, appointment_id,
  subtotal_paisa, discount_paisa, tax_paisa, total_paisa, amount_paid_paisa, balance_paisa,
  issued_at, due_date, notes, cancelled_at, cancellation_reason, pdf_path, created_at,
  client:clients (full_name, phone),
  pet:pets (name),
  items:invoice_items (id, service_id, description, quantity, unit_price_paisa, tax_rate_percent, line_total_paisa, sort_order)
`;

type One<T> = T | T[] | null;
function one<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toItem(row: any): InvoiceItem {
  return {
    id: row.id,
    serviceId: row.service_id,
    description: row.description,
    quantity: row.quantity,
    unitPricePaisa: row.unit_price_paisa,
    unitPrice: formatCurrency(row.unit_price_paisa),
    taxRatePercent: Number(row.tax_rate_percent),
    lineTotalPaisa: row.line_total_paisa,
    lineTotal: formatCurrency(row.line_total_paisa),
    sortOrder: row.sort_order,
  };
}

function toDetail(row: any): InvoiceDetail {
  const client = one<any>(row.client);
  const pet = one<any>(row.pet);

  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    clientId: row.client_id,
    clientName: client?.full_name ?? "Unknown client",
    clientPhone: client?.phone ?? "",
    petId: row.pet_id,
    petName: pet?.name ?? null,
    appointmentId: row.appointment_id,
    subtotalPaisa: row.subtotal_paisa,
    discountPaisa: row.discount_paisa,
    taxPaisa: row.tax_paisa,
    totalPaisa: row.total_paisa,
    amountPaidPaisa: row.amount_paid_paisa,
    balancePaisa: row.balance_paisa,
    subtotal: formatCurrency(row.subtotal_paisa),
    discount: formatCurrency(row.discount_paisa),
    tax: formatCurrency(row.tax_paisa),
    total: formatCurrency(row.total_paisa),
    amountPaid: formatCurrency(row.amount_paid_paisa),
    balance: formatCurrency(row.balance_paisa),
    issuedAt: row.issued_at,
    dueDate: row.due_date,
    notes: row.notes,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    pdfPath: row.pdf_path,
    createdAt: row.created_at,
    items: ((row.items ?? []) as any[]).map(toItem).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export async function getInvoice(invoiceId: string): Promise<Result<InvoiceDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("invoices").select(INVOICE_COLUMNS).eq("id", invoiceId).maybeSingle();

  if (error) {
    console.error("[invoices] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toDetail(data) : null };
}

/** The invoice already generated for this appointment, if any — avoids a duplicate. */
export async function getInvoiceForAppointment(appointmentId: string): Promise<Result<InvoiceDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[invoices] appointment lookup failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toDetail(data) : null };
}

export async function listInvoicesForClient(clientId: string): Promise<Result<InvoiceDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[invoices] client list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

export async function listInvoicesForPet(petId: string): Promise<Result<InvoiceDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("pet_id", petId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[invoices] pet list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

/** Every invoice in the practice, optionally filtered by status — the admin billing list. */
export async function listInvoicesForOrg(status?: InvoiceStatus): Promise<Result<InvoiceDetail[]>> {
  const supabase = await createClient();

  let query = supabase.from("invoices").select(INVOICE_COLUMNS).is("deleted_at", null);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);

  if (error) {
    console.error("[invoices] org list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

/** A short-lived link to the stored PDF. The bucket is private. */
export async function signedInvoicePdfUrl(path: string | null, seconds = 600): Promise<string | null> {
  if (!path) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("invoice-pdfs").createSignedUrl(path, seconds);

  if (error) {
    console.error("[invoices] signing pdf url failed", error);
    return null;
  }

  return data.signedUrl;
}

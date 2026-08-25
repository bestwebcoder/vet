import { formatCurrency } from "@/lib/currency";
import type { PaymentInput } from "@/lib/validation/payment";
import { createClient } from "@/lib/supabase/server";

/** Payment reads. Insert-only ledger — nothing here ever updates a row. */

export type Payment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  amountPaisa: number;
  amount: string;
  method: PaymentInput["method"];
  referenceNumber: string | null;
  paidAt: string;
  notes: string | null;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };
export type PaginatedResult<T> =
  | { status: "ok"; data: T[]; totalCount: number; page: number; pageSize: number }
  | { status: "error" };

const PAYMENT_COLUMNS = `
  id, invoice_id, amount_paisa, method, reference_number, paid_at, notes,
  invoice:invoices (invoice_number, client:clients (full_name))
`;

type One<T> = T | T[] | null;
function one<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toPayment(row: any): Payment {
  const invoice = one<any>(row.invoice);
  const client = invoice ? one<any>(invoice.client) : null;

  return {
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: invoice?.invoice_number ?? null,
    clientName: client?.full_name ?? null,
    amountPaisa: row.amount_paisa,
    amount: formatCurrency(row.amount_paisa),
    method: row.method,
    referenceNumber: row.reference_number,
    paidAt: row.paid_at,
    notes: row.notes,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listPaymentsForInvoice(invoiceId: string): Promise<Result<Payment[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("invoice_id", invoiceId)
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("[payments] invoice list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toPayment) };
}

/**
 * Every payment recorded in the practice, filtered and paginated, newest
 * first — the admin payments log. `from`/`to` bound `paid_at` (a
 * `yyyy-MM-dd` date, inclusive both ends).
 */
export async function listPaymentsForOrg(options: {
  method?: PaymentInput["method"];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PaginatedResult<Payment>> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? 25;

  let query = supabase.from("payments").select(PAYMENT_COLUMNS, { count: "exact" });
  if (options.method) query = query.eq("method", options.method);
  if (options.from) query = query.gte("paid_at", options.from);
  if (options.to) query = query.lte("paid_at", `${options.to}T23:59:59.999Z`);

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("paid_at", { ascending: false })
    .range(start, start + pageSize - 1);

  if (error) {
    console.error("[payments] org list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toPayment), totalCount: count ?? 0, page, pageSize };
}

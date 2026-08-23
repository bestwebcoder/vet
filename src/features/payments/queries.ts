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

/** Every payment recorded in the practice, newest first — the admin payments log. */
export async function listPaymentsForOrg(): Promise<Result<Payment[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .order("paid_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[payments] org list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toPayment) };
}

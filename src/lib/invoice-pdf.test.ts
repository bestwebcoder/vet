import { describe, expect, it } from "vitest";

import { renderInvoicePdf, type InvoicePdfInput } from "@/lib/invoice-pdf";

const BASE_INVOICE: InvoicePdfInput = {
  id: "11111111-1111-1111-1111-111111111111",
  invoice_number: "INV-000001",
  status: "issued",
  client_id: "22222222-2222-2222-2222-222222222222",
  pet_id: "33333333-3333-3333-3333-333333333333",
  subtotal_paisa: 150000,
  discount_paisa: 10000,
  tax_paisa: 7000,
  total_paisa: 147000,
  amount_paid_paisa: 50000,
  balance_paisa: 97000,
  issued_at: "2026-08-01T09:30:00.000Z",
  due_date: "2026-08-15",
  organization_id: "44444444-4444-4444-4444-444444444444",
  client: { full_name: "Rashed Karim", phone: "+8801711000401", address: null },
  pet: { name: "Bruno" },
  items: [
    {
      description: "General consultation",
      quantity: 1,
      unit_price_paisa: 100000,
      tax_rate_percent: 5,
      line_total_paisa: 100000,
      sort_order: 10,
    },
    {
      description: "Home visit fee",
      quantity: 1,
      unit_price_paisa: 50000,
      tax_rate_percent: 0,
      line_total_paisa: 50000,
      sort_order: 20,
    },
  ],
};

/** A stub Supabase client: no organization row on file — exercises the fallback path. */
const stubSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null }),
      }),
    }),
  }),
};

describe("renderInvoicePdf", () => {
  it("produces a real PDF, without an organization on record", async () => {
    const buffer = await renderInvoicePdf(BASE_INVOICE, stubSupabase);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // The PDF magic number.
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("still renders with no patient and no items beyond the required one", async () => {
    const buffer = await renderInvoicePdf(
      { ...BASE_INVOICE, pet: null, items: [BASE_INVOICE.items[0]] },
      stubSupabase,
    );

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});

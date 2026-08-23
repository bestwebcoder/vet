import { z } from "zod";

import { CurrencyFormatError, taakaToPaisa } from "@/lib/currency";
import { optionalIsoDate, optionalText } from "@/lib/validation/common";

/** §7.4 — invoices and their line items. */

function optionalId() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}

function priceSchema(label: string) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      try {
        return taakaToPaisa(value === "" ? "0" : value);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message: error instanceof CurrencyFormatError ? error.message : `Enter ${label} in taka, for example 500`,
        });
        return z.NEVER;
      }
    });
}

export const invoiceItemSchema = z.object({
  serviceId: optionalId(),
  description: z.string().trim().min(1, "Enter a description").max(300, "Keep it under 300 characters"),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number")
    .transform(Number)
    .refine((value) => value > 0 && value <= 999, "Enter a quantity between 1 and 999"),
  unitPricePaisa: priceSchema("the unit price"),
  taxRatePercent: z
    .string()
    .trim()
    .transform((value) => (value === "" ? "0" : value))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, "Enter a percentage like 15 or 7.5")
        .transform(Number)
        .refine((value) => value >= 0 && value <= 100, "Enter a percentage between 0 and 100"),
    ),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export function invoiceItemToRow(data: InvoiceItemInput) {
  return {
    service_id: data.serviceId,
    description: data.description,
    quantity: data.quantity,
    unit_price_paisa: data.unitPricePaisa,
    tax_rate_percent: data.taxRatePercent,
    line_total_paisa: data.quantity * data.unitPricePaisa,
  };
}

export const invoiceDiscountSchema = z.object({
  discountPaisa: priceSchema("the discount"),
});

export const invoiceIssueSchema = z.object({
  dueDate: optionalIsoDate("due date"),
  notes: optionalText(1000, "Notes"),
});

export const invoiceCancelSchema = z.object({
  cancellationReason: z.string().trim().min(1, "Enter a reason").max(300, "Keep it under 300 characters"),
});

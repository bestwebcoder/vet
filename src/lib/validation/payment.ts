import { z } from "zod";

import { CurrencyFormatError, taakaToPaisa } from "@/lib/currency";
import { optionalText } from "@/lib/validation/common";

/** §7.6 — manual payment recording. */

export const PAYMENT_METHODS = ["cash", "bank_transfer", "bkash", "nagad", "card", "other"] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  other: "Other",
};

export const paymentSchema = z.object({
  amountPaisa: z
    .string()
    .trim()
    .transform((value, ctx) => {
      try {
        return taakaToPaisa(value);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message: error instanceof CurrencyFormatError ? error.message : "Enter an amount in taka, for example 500",
        });
        return z.NEVER;
      }
    })
    .refine((value) => value > 0, "Enter an amount greater than zero"),
  method: z.enum(PAYMENT_METHODS),
  referenceNumber: optionalText(100, "Reference number"),
  notes: optionalText(500, "Notes"),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

/**
 * Recording a refund.
 *
 * Method is its own field rather than inherited from the payment: a bKash
 * payment may well be refunded in cash across the counter, and the record
 * should say how the money actually went back.
 *
 * Reason is required, unlike a payment's optional note — money leaving the
 * practice is the thing an auditor asks about first.
 */
export const refundSchema = z.object({
  amountPaisa: z
    .string()
    .trim()
    .transform((value, ctx) => {
      try {
        return taakaToPaisa(value);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message: error instanceof CurrencyFormatError ? error.message : "Enter an amount in taka, for example 500",
        });
        return z.NEVER;
      }
    })
    .refine((value) => value > 0, "Enter an amount greater than zero"),
  method: z.enum(PAYMENT_METHODS),
  reason: z
    .string()
    .trim()
    .min(1, "Say why this is being refunded")
    .max(500, "Keep the reason under 500 characters"),
  referenceNumber: optionalText(100, "Reference number"),
});

export type RefundInput = z.infer<typeof refundSchema>;

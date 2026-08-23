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

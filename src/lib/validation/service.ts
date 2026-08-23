import { z } from "zod";

import { CurrencyFormatError, taakaToPaisa } from "@/lib/currency";
import { optionalText } from "@/lib/validation/common";

/** §7.2/§7.3 — an admin-priced, admin-managed service. Prices never hard-coded. */

function optionalId() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}

const priceSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return taakaToPaisa(value === "" ? "0" : value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof CurrencyFormatError ? error.message : "Enter an amount in taka, for example 500",
      });
      return z.NEVER;
    }
  });

const taxRateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a percentage like 15 or 7.5")
      .transform(Number)
      .refine((value) => value >= 0 && value <= 100, "Enter a percentage between 0 and 100"),
  );

export const serviceSchema = z.object({
  categoryId: optionalId(),
  name: z.string().trim().min(1, "Enter a service name").max(200, "Keep it under 200 characters"),
  description: optionalText(500, "Description"),
  durationMinutes: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number of minutes")
    .transform(Number)
    .refine((value) => value >= 5 && value <= 480, "Duration must be between 5 and 480 minutes"),
  pricePaisa: priceSchema,
  taxRatePercent: taxRateSchema,
  isHomeVisitAvailable: z.boolean(),
  isHomeVisitFee: z.boolean(),
  requiresDoctor: z.boolean(),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

export function serviceToRow(data: ServiceInput) {
  return {
    category_id: data.categoryId,
    name: data.name,
    description: data.description,
    duration_minutes: data.durationMinutes,
    price_paisa: data.pricePaisa,
    tax_rate_percent: data.taxRatePercent,
    is_home_visit_available: data.isHomeVisitAvailable,
    is_home_visit_fee: data.isHomeVisitFee,
    requires_doctor: data.requiresDoctor,
  };
}

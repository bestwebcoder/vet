import { z } from "zod";

import { DEWORMING_INTERVALS } from "@/lib/deworming-interval";
import { kilogramsToGrams, WeightFormatError } from "@/lib/units";
import { isoDateSchema, optionalText } from "@/lib/validation/common";

/** §6.4 — a single deworming record, entered by the attending doctor. */

const optionalWeightSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;

    try {
      return kilogramsToGrams(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof WeightFormatError ? error.message : "Enter a weight in kilograms, for example 12.4",
      });
      return z.NEVER;
    }
  })
  .nullish()
  .transform((value) => value ?? null);

export const dewormingEntrySchema = z
  .object({
    product: z.string().trim().min(1, "Enter a product name").max(200, "Keep it under 200 characters"),
    activeIngredient: optionalText(200, "Active ingredient"),
    dose: optionalText(100, "Dose"),
    route: optionalText(100, "Route"),
    weightGrams: optionalWeightSchema,
    dateAdministered: isoDateSchema,
    interval: z.enum(DEWORMING_INTERVALS),
    customIntervalDays: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .nullish()
      .transform((value) => value ?? null)
      .pipe(
        z
          .string()
          .regex(/^\d+$/, "Enter a whole number of days")
          .transform(Number)
          .refine((value) => value > 0 && value <= 3650, "Enter a number between 1 and 3650")
          .nullable(),
      ),
    nextDueDate: isoDateSchema,
    notes: optionalText(2000, "Notes"),
  })
  .refine((data) => data.interval !== "custom" || data.customIntervalDays !== null, {
    message: "Enter the custom interval in days",
    path: ["customIntervalDays"],
  });

export type DewormingEntryInput = z.infer<typeof dewormingEntrySchema>;

export function dewormingEntryToRow(data: DewormingEntryInput) {
  return {
    product: data.product,
    active_ingredient: data.activeIngredient,
    dose: data.dose,
    route: data.route,
    weight_grams: data.weightGrams,
    date_administered: data.dateAdministered,
    interval: data.interval,
    custom_interval_days: data.interval === "custom" ? data.customIntervalDays : null,
    next_due_date: data.nextDueDate,
    notes: data.notes,
  };
}

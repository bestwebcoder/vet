import { z } from "zod";

import { optionalText, uuidSchema } from "@/lib/validation/common";

/**
 * One schema for a prescription's header, and one for a single item —
 * shared by the form and the server action, same convention as `soap.ts`.
 */

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date")
  .transform((value) => (value === "" ? null : value))
  .nullish()
  .transform((value) => value ?? null);

function optionalDecimal(label: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d+)?$/, `${label} must be a number`)
        .transform(Number)
        .refine((value) => value > 0, `${label} must be greater than zero`)
        .nullable(),
    );
}

export const prescriptionSchema = z.object({
  followUpDate: optionalDate,
  instructions: optionalText(2000, "Instructions"),
});

export type PrescriptionInput = z.input<typeof prescriptionSchema>;
export type PrescriptionValues = z.output<typeof prescriptionSchema>;

export function prescriptionToRow(values: PrescriptionValues) {
  return {
    follow_up_date: values.followUpDate,
    instructions: values.instructions,
  };
}

export const prescriptionItemSchema = z.object({
  medicationId: uuidSchema.nullish().transform((value) => value ?? null),
  drugName: z.string().trim().min(1, "Enter a drug name").max(200, "Keep it under 200 characters"),
  strength: optionalText(100, "Strength"),
  formulation: optionalText(100, "Formulation"),
  dosePerKg: optionalDecimal("Dose per kg"),
  doseUnit: optionalText(20, "Dose unit"),
  computedDose: optionalDecimal("Dose"),
  route: optionalText(50, "Route"),
  frequency: optionalText(50, "Frequency"),
  duration: optionalText(100, "Duration"),
  quantity: optionalText(100, "Quantity"),
  instructions: optionalText(500, "Instructions"),
});

export type PrescriptionItemInput = z.input<typeof prescriptionItemSchema>;
export type PrescriptionItemValues = z.output<typeof prescriptionItemSchema>;

export function prescriptionItemToRow(values: PrescriptionItemValues) {
  return {
    medication_id: values.medicationId,
    drug_name: values.drugName,
    strength: values.strength,
    formulation: values.formulation,
    dose_per_kg: values.dosePerKg,
    dose_unit: values.doseUnit,
    computed_dose: values.computedDose,
    route: values.route,
    frequency: values.frequency,
    duration: values.duration,
    quantity: values.quantity,
    instructions: values.instructions,
  };
}

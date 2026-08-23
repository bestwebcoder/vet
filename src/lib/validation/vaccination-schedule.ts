import { z } from "zod";

import { optionalText } from "@/lib/validation/common";

/** §6.3 — an administrator-configurable catalog entry. */

export const VACCINATION_INTERVAL_UNITS = ["days", "weeks", "months", "years"] as const;

export const VACCINATION_INTERVAL_UNIT_LABELS: Record<(typeof VACCINATION_INTERVAL_UNITS)[number], string> = {
  days: "Days",
  weeks: "Weeks",
  months: "Months",
  years: "Years",
};

function optionalId() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}

export const vaccinationScheduleSchema = z.object({
  speciesId: optionalId(),
  vaccineName: z.string().trim().min(1, "Enter a vaccine name").max(200, "Keep it under 200 characters"),
  intervalValue: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number")
    .transform(Number)
    .refine((value) => value > 0 && value <= 999, "Enter a number between 1 and 999"),
  intervalUnit: z.enum(VACCINATION_INTERVAL_UNITS),
  description: optionalText(500, "Description"),
});

export type VaccinationScheduleInput = z.infer<typeof vaccinationScheduleSchema>;

export function vaccinationScheduleToRow(data: VaccinationScheduleInput) {
  return {
    species_id: data.speciesId,
    vaccine_name: data.vaccineName,
    interval_value: data.intervalValue,
    interval_unit: data.intervalUnit,
    description: data.description,
  };
}

import { z } from "zod";

import { isoDateSchema, optionalIsoDate, optionalText } from "@/lib/validation/common";

/** §6.2 — a single vaccination record, entered by the attending doctor. */

function optionalId() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}

export const vaccinationEntrySchema = z.object({
  vaccinationScheduleId: optionalId(),
  vaccineName: z.string().trim().min(1, "Enter a vaccine name").max(200, "Keep it under 200 characters"),
  manufacturer: optionalText(200, "Manufacturer"),
  batchNumber: optionalText(100, "Batch number"),
  lotNumber: optionalText(100, "Lot number"),
  expiryDate: optionalIsoDate("expiry date"),
  dateAdministered: isoDateSchema,
  dose: optionalText(100, "Dose"),
  route: optionalText(100, "Route"),
  site: optionalText(100, "Site"),
  nextDueDate: optionalIsoDate("next due date"),
  notes: optionalText(2000, "Notes"),
});

export type VaccinationEntryInput = z.infer<typeof vaccinationEntrySchema>;

export function vaccinationEntryToRow(data: VaccinationEntryInput) {
  return {
    vaccination_schedule_id: data.vaccinationScheduleId,
    vaccine_name: data.vaccineName,
    manufacturer: data.manufacturer,
    batch_number: data.batchNumber,
    lot_number: data.lotNumber,
    expiry_date: data.expiryDate,
    date_administered: data.dateAdministered,
    dose: data.dose,
    route: data.route,
    site: data.site,
    next_due_date: data.nextDueDate,
    notes: data.notes,
  };
}

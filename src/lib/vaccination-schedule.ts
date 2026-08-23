import { add, format } from "date-fns";

/**
 * Suggests a next due date from a vaccination schedule's interval. Always a
 * suggestion, never enforced — the doctor can overwrite the date field before
 * saving, same as `computeDose` never locks `computed_dose` (Phase 5).
 */

export type VaccinationIntervalUnit = "days" | "weeks" | "months" | "years";

export function computeNextVaccinationDueDate(
  dateAdministered: string,
  intervalValue: number,
  intervalUnit: VaccinationIntervalUnit,
): string {
  const administered = new Date(`${dateAdministered}T00:00:00`);
  const next = add(administered, { [intervalUnit]: intervalValue });
  return format(next, "yyyy-MM-dd");
}

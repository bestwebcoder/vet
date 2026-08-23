import { add, format } from "date-fns";

/**
 * §6.4's four scheduling options. "custom" is the only one that needs a
 * doctor-entered day count; the other three are fixed by definition, not a
 * database catalog — there is nothing here for an administrator to configure.
 */

export const DEWORMING_INTERVALS = ["monthly", "quarterly", "semi_annual", "custom"] as const;
export type DewormingInterval = (typeof DEWORMING_INTERVALS)[number];

export const DEWORMING_INTERVAL_LABELS: Record<DewormingInterval, string> = {
  monthly: "Monthly",
  quarterly: "Every 3 months",
  semi_annual: "Every 6 months",
  custom: "Custom interval",
};

const FIXED_INTERVAL_DAYS: Record<Exclude<DewormingInterval, "custom">, number> = {
  monthly: 30,
  quarterly: 90,
  semi_annual: 180,
};

export class MissingCustomIntervalError extends Error {}

/** A suggestion the doctor can freely overwrite before saving — never enforced. */
export function computeNextDewormingDueDate(
  dateAdministered: string,
  interval: DewormingInterval,
  customIntervalDays?: number | null,
): string {
  if (interval === "custom") {
    if (!customIntervalDays || customIntervalDays <= 0) {
      throw new MissingCustomIntervalError("Enter the number of days for a custom interval.");
    }
    return addDays(dateAdministered, customIntervalDays);
  }

  return addDays(dateAdministered, FIXED_INTERVAL_DAYS[interval]);
}

function addDays(dateAdministered: string, days: number): string {
  const administered = new Date(`${dateAdministered}T00:00:00`);
  return format(add(administered, { days }), "yyyy-MM-dd");
}

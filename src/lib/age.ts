import { differenceInDays, differenceInMonths, differenceInYears } from "date-fns";

/**
 * Age is derived from date of birth every time it is read, never stored.
 * A stored age is wrong the day after it is written.
 */

const DHAKA = "Asia/Dhaka";

/** Today's date in the practice's own timezone, as a plain calendar date. */
export function todayInDhaka(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // en-CA renders as YYYY-MM-DD; parsed as local midnight so no offset applies.
  const [year, month, day] = parts.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** A calendar date string (YYYY-MM-DD) read without timezone drift. */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export type Age = { years: number; months: number; days: number };

export function ageFrom(dateOfBirth: string | Date, now?: Date): Age | null {
  const born = typeof dateOfBirth === "string" ? parseDateOnly(dateOfBirth) : dateOfBirth;
  const today = todayInDhaka(now);

  if (Number.isNaN(born.getTime()) || born > today) return null;

  const years = differenceInYears(today, born);
  const afterYears = new Date(born);
  afterYears.setFullYear(afterYears.getFullYear() + years);

  const months = differenceInMonths(today, afterYears);
  const afterMonths = new Date(afterYears);
  afterMonths.setMonth(afterMonths.getMonth() + months);

  return { years, months, days: differenceInDays(today, afterMonths) };
}

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/**
 * Age in the terms a vet would say it: years for an adult, months for a
 * juvenile, days for a neonate. An estimated birth date is marked, because
 * "about 4 years" and "4 years" mean different things clinically.
 */
export function formatAge(
  dateOfBirth: string | null | undefined,
  options: { isEstimated?: boolean; now?: Date } = {},
): string {
  if (!dateOfBirth) return "Age unknown";

  const age = ageFrom(dateOfBirth, options.now);
  if (!age) return "Age unknown";

  const prefix = options.isEstimated ? "About " : "";

  if (age.years >= 2) return `${prefix}${plural(age.years, "year")}`;

  if (age.years >= 1) {
    return age.months > 0
      ? `${prefix}${plural(age.years, "year")} ${plural(age.months, "month")}`
      : `${prefix}${plural(age.years, "year")}`;
  }

  if (age.months >= 1) return `${prefix}${plural(age.months, "month")}`;

  return `${prefix}${plural(age.days, "day")}`;
}

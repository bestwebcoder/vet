import { z } from "zod";

import { isoDateSchema } from "@/lib/validation/common";

/** §8.5 — every report takes a date range. Defaults to the last 30 days. */

export const dateRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((value) => value.to >= value.from, { message: "The end date must be on or after the start date.", path: ["to"] });

export type DateRange = z.infer<typeof dateRangeSchema>;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last 30 days, inclusive of today. */
export function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

/** Reads a date range from parsed search params, falling back to the default when absent or invalid. */
export function readDateRange(searchParams: Record<string, string | string[] | undefined>): DateRange {
  const from = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const to = typeof searchParams.to === "string" ? searchParams.to : undefined;

  if (!from || !to) return defaultDateRange();

  const parsed = dateRangeSchema.safeParse({ from, to });
  return parsed.success ? parsed.data : defaultDateRange();
}

/**
 * One report screen carries several independent tables, so each reads its own
 * page parameter — `?byService=2` moves that table and leaves the rest alone.
 */
export function readReportPage(searchParams: Record<string, string | string[] | undefined>, key: string): number {
  const raw = searchParams[key];
  const value = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

/** Search params narrowed to the single-valued entries Pagination preserves. */
export function singleValued(searchParams: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

import { z } from "zod";

import { VISIT_TYPES } from "@/lib/validation/appointment";
import { timeSchema, uuidSchema } from "@/lib/validation/common";

/**
 * One schema for a doctor's availability window, shared by the form and the
 * server action. Working days, hours and breaks are all instances of this:
 * a doctor working 09:00–13:00 and 14:00–17:00 has two windows, and the gap
 * between them is the break — see the comment on `doctor_availability` in
 * `supabase/migrations/20260820000700_appointments.sql`.
 */
export const availabilitySchema = z
  .object({
    weekday: z.coerce.number().int().min(0, "Choose a day").max(6, "Choose a day"),
    startsAt: timeSchema,
    endsAt: timeSchema,
    slotMinutes: z.coerce
      .number()
      .int()
      .min(5, "Slots must be at least 5 minutes")
      .max(240, "Slots must be 240 minutes or fewer"),
    visitType: z
      .enum(VISIT_TYPES)
      .nullish()
      .transform((value) => value ?? null),
    branchId: uuidSchema.nullish().transform((value) => value ?? null),
  })
  .refine((values) => values.endsAt > values.startsAt, {
    message: "End time must be after the start time",
    path: ["endsAt"],
  });

/** date_part('dow') numbering: 0 = Sunday. */
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type AvailabilityInput = z.input<typeof availabilitySchema>;
export type AvailabilityValues = z.output<typeof availabilitySchema>;

export function availabilityToRow(values: AvailabilityValues) {
  return {
    weekday: values.weekday,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    slot_minutes: values.slotMinutes,
    visit_type: values.visitType,
    branch_id: values.branchId,
  };
}

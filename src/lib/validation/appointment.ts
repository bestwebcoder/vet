import { z } from "zod";

import { dhakaInstant } from "@/lib/age";
import { isoDateSchema, optionalText, timeSchema, uuidSchema } from "@/lib/validation/common";

/**
 * One schema for booking a visit, shared by the form and the server action.
 *
 * Mirrors `appointments_visit_type_allowed` in
 * `supabase/migrations/20260820000700_appointments.sql` — these seven values
 * are a structural enum, the same kind of thing `PET_SEXES` already is for
 * pets, not business configuration. Status names/colours, by contrast, are
 * read from the `appointment_statuses` table rather than listed here — see
 * `src/features/appointments/queries.ts::listAppointmentStatuses`.
 */
export const VISIT_TYPES = [
  "clinic",
  "home",
  "follow_up",
  "emergency",
  "surgery",
  "vaccination",
  "other",
] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  clinic: "Clinic visit",
  home: "Home visit",
  follow_up: "Follow-up",
  emergency: "Emergency",
  surgery: "Surgery",
  vaccination: "Vaccination",
  other: "Other",
};

export const appointmentSchema = z.object({
  petId: uuidSchema,
  serviceId: uuidSchema,
  doctorId: uuidSchema,
  visitType: z.enum(VISIT_TYPES),
  date: isoDateSchema,
  time: timeSchema,
  reason: optionalText(1000, "Reason for visit"),
  location: optionalText(300, "Location"),
});

export type AppointmentInput = z.input<typeof appointmentSchema>;
export type AppointmentValues = z.output<typeof appointmentSchema>;

/** A local wall-clock date/time and a duration, as a stored interval. */
export function appointmentInterval(date: string, time: string, durationMinutes: number) {
  const startsAt = dhakaInstant(date, time);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() };
}

/** Combines the schema's local date/time with the service duration into an interval. */
export function appointmentToRow(values: AppointmentValues, durationMinutes: number) {
  return {
    pet_id: values.petId,
    service_id: values.serviceId,
    doctor_id: values.doctorId,
    visit_type: values.visitType,
    ...appointmentInterval(values.date, values.time, durationMinutes),
    reason: values.reason,
    location: values.location,
  };
}

export const rescheduleSchema = z.object({
  date: isoDateSchema,
  time: timeSchema,
});

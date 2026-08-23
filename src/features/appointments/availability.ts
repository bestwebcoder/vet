import { dhakaInstant, nowInDhaka, parseDateOnly } from "@/lib/age";
import { createClient } from "@/lib/supabase/server";
import { getService } from "@/features/services/queries";

/**
 * Turns a doctor's configured availability into the actual times a client can
 * book, for one day.
 *
 * This mirrors, in the browser's favour, what the database's own exclusion
 * constraints ultimately decide: `doctor_availability_no_overlap` shapes which
 * windows can exist, `appointments_no_double_booking` is the real guarantee
 * against two bookings for the same time. This function only offers slots
 * that guarantee would accept — the insert can still race and lose, which the
 * calling action handles by catching the exclusion violation.
 */

/** Statuses that still occupy a doctor's time — mirrors `occupies_slot` on `appointment_statuses`. */
export const OCCUPYING_STATUSES = [
  "requested",
  "confirmed",
  "checked_in",
  "in_consultation",
  "completed",
] as const;

export type AvailabilityResult =
  | { status: "error" }
  | { status: "empty"; reason: "date_in_past" | "no_availability" | "fully_booked" }
  | { status: "ok"; slots: string[] };

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export async function computeAvailableSlots(params: {
  doctorId: string;
  serviceId: string;
  visitType: string;
  date: string;
}): Promise<AvailabilityResult> {
  const { doctorId, serviceId, visitType, date } = params;

  const requested = parseDateOnly(date);
  if (Number.isNaN(requested.getTime())) return { status: "error" };

  const today = nowInDhaka();
  if (date < today.date) return { status: "empty", reason: "date_in_past" };

  const service = await getService(serviceId);
  if (service.status === "error") return { status: "error" };
  if (!service.data) return { status: "error" };
  const durationMinutes = service.data.durationMinutes;

  const supabase = await createClient();
  const dayStart = dhakaInstant(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [{ data: windows, error: windowsError }, { data: booked, error: bookedError }] =
    await Promise.all([
      supabase
        .from("doctor_availability")
        .select("starts_at, ends_at, slot_minutes, visit_type")
        .eq("doctor_id", doctorId)
        .eq("weekday", requested.getDay())
        .eq("is_active", true)
        .is("deleted_at", null)
        .or(`visit_type.is.null,visit_type.eq.${visitType}`),
      supabase
        .from("appointments")
        .select("starts_at, ends_at")
        .eq("doctor_id", doctorId)
        .is("deleted_at", null)
        .in("status", OCCUPYING_STATUSES)
        .gte("starts_at", dayStart.toISOString())
        .lt("starts_at", dayEnd.toISOString()),
    ]);

  if (windowsError || bookedError) {
    console.error("[appointments] availability lookup failed", windowsError ?? bookedError);
    return { status: "error" };
  }

  if (!windows || windows.length === 0) {
    return { status: "empty", reason: "no_availability" };
  }

  const occupied = (booked ?? []).map((row) => ({
    starts: new Date(row.starts_at).getTime(),
    ends: new Date(row.ends_at).getTime(),
  }));

  const nowMinutes = date === today.date ? timeToMinutes(today.time) : -Infinity;
  const candidates = new Set<string>();

  for (const window of windows) {
    const windowStart = timeToMinutes(window.starts_at.slice(0, 5));
    const windowEnd = timeToMinutes(window.ends_at.slice(0, 5));
    const step = window.slot_minutes;

    for (let start = windowStart; start + durationMinutes <= windowEnd; start += step) {
      if (start <= nowMinutes) continue;

      const time = minutesToTime(start);
      const candidateStart = dhakaInstant(date, time).getTime();
      const candidateEnd = candidateStart + durationMinutes * 60_000;

      const overlaps = occupied.some(
        (existing) => candidateStart < existing.ends && candidateEnd > existing.starts,
      );

      if (!overlaps) candidates.add(time);
    }
  }

  if (candidates.size === 0) return { status: "empty", reason: "fully_booked" };

  return { status: "ok", slots: [...candidates].sort() };
}

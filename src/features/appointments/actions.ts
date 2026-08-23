"use server";

import { revalidatePath } from "next/cache";

import { computeAvailableSlots, type AvailabilityResult } from "@/features/appointments/availability";
import { getSessionUser } from "@/features/auth/session";
import { getService } from "@/features/services/queries";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { appointmentInterval, appointmentSchema, appointmentToRow, rescheduleSchema } from "@/lib/validation/appointment";

/**
 * Appointment writes.
 *
 * These actions resolve who and what a booking is for and hand validated
 * values to the schema. They are not the access boundary: row level security,
 * and — for what a client may change about their own booking — the
 * `guard_client_appointment_update` trigger, decide whether the write is
 * allowed and refuse one these checks let through.
 */

function readAppointmentForm(formData: FormData) {
  return {
    petId: text(formData, "petId") ?? "",
    serviceId: text(formData, "serviceId") ?? "",
    doctorId: text(formData, "doctorId") ?? "",
    visitType: text(formData, "visitType") ?? "",
    date: text(formData, "date") ?? "",
    time: text(formData, "time") ?? "",
    reason: text(formData, "reason") ?? "",
    location: text(formData, "location") ?? "",
  };
}

function slotUnavailable(): FormState {
  return {
    status: "error",
    message: "That time is no longer available. Please choose another slot.",
    fieldErrors: { time: ["Not available"] },
  };
}

const REVALIDATE_PATHS = [
  "/client/appointments",
  "/doctor/appointments",
  "/doctor/calendar",
  "/admin/appointments",
];

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
}

/** Called directly from the booking form as the doctor/service/date change. */
export async function getAvailableSlotsAction(input: {
  doctorId: string;
  serviceId: string;
  visitType: string;
  date: string;
}): Promise<AvailabilityResult> {
  if (!input.doctorId || !input.serviceId || !input.visitType || !input.date) {
    return { status: "empty", reason: "no_availability" };
  }

  return computeAvailableSlots(input);
}

export async function createAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = appointmentSchema.safeParse(readAppointmentForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const user = await getSessionUser();
  if (!user) return { status: "error", message: "Please sign in again." };

  const supabase = await createClient();

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("client_id, organization_id")
    .eq("id", parsed.data.petId)
    .is("deleted_at", null)
    .maybeSingle();

  if (petError || !pet) {
    return { status: "error", message: "That patient could not be found." };
  }

  const service = await getService(parsed.data.serviceId);
  if (service.status === "error" || !service.data) {
    return { status: "error", message: "That service could not be found." };
  }

  const availability = await computeAvailableSlots({
    doctorId: parsed.data.doctorId,
    serviceId: parsed.data.serviceId,
    visitType: parsed.data.visitType,
    date: parsed.data.date,
  });

  if (availability.status !== "ok" || !availability.slots.includes(parsed.data.time)) {
    return slotUnavailable();
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      ...appointmentToRow(parsed.data, service.data.durationMinutes),
      client_id: pet.client_id,
      organization_id: pet.organization_id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23P01") return slotUnavailable();
    return failure("appointments", error, "We could not book this appointment just now. Please try again.");
  }

  const sourceSoapRecordId = text(formData, "sourceSoapRecordId");
  if (sourceSoapRecordId) {
    const { error: followUpError } = await supabase
      .from("soap_records")
      .update({ follow_up_scheduled_at: new Date().toISOString() })
      .eq("id", sourceSoapRecordId);

    // The appointment is booked either way — a failure here only means the
    // "Follow-ups due" card stays stale, not that anything was lost.
    if (followUpError) console.error("[appointments] marking follow-up scheduled failed", followUpError);
  }

  revalidateAll();

  return { status: "success", message: "Appointment requested. You will be notified once it is confirmed.", id: data.id };
}

export async function rescheduleAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  if (!appointmentId) return { status: "error", message: "We could not tell which appointment to change." };

  const parsed = rescheduleSchema.safeParse({
    date: text(formData, "date") ?? "",
    time: text(formData, "time") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("appointments")
    .select("doctor_id, service_id, visit_type")
    .eq("id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError || !existing) {
    return { status: "error", message: "That appointment could not be found." };
  }

  const service = await getService(existing.service_id);
  if (service.status === "error" || !service.data) {
    return { status: "error", message: "That service could not be found." };
  }

  const availability = await computeAvailableSlots({
    doctorId: existing.doctor_id,
    serviceId: existing.service_id,
    visitType: existing.visit_type,
    date: parsed.data.date,
  });

  if (availability.status !== "ok" || !availability.slots.includes(parsed.data.time)) {
    return slotUnavailable();
  }

  const interval = appointmentInterval(parsed.data.date, parsed.data.time, service.data.durationMinutes);

  const { error } = await supabase.from("appointments").update(interval).eq("id", appointmentId);

  if (error) {
    if (error.code === "23P01") return slotUnavailable();
    return failure("appointments", error, "We could not reschedule this appointment just now. Please try again.");
  }

  revalidateAll();

  return { status: "success", message: "Appointment rescheduled." };
}

export async function cancelAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  if (!appointmentId) return { status: "error", message: "We could not tell which appointment to cancel." };

  const user = await getSessionUser();
  if (!user) return { status: "error", message: "Please sign in again." };

  const cancellationReason = text(formData, "cancellationReason") ?? null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancellation_reason: cancellationReason,
    })
    .eq("id", appointmentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure(
      "appointments",
      error,
      "We could not cancel this appointment just now. It may be too close to the appointment time — please contact the clinic.",
    );
  }

  if (!data) {
    return { status: "error", message: "You do not have access to this appointment." };
  }

  revalidateAll();

  return { status: "success", message: "Appointment cancelled." };
}

const STATUS_ORDER = ["requested", "confirmed", "checked_in", "in_consultation", "completed"] as const;
const VALID_STATUSES = [...STATUS_ORDER, "cancelled", "no_show"];

export async function updateAppointmentStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  const status = text(formData, "status");

  if (!appointmentId || !status || !VALID_STATUSES.includes(status)) {
    return { status: "error", message: "That is not a valid status." };
  }

  const supabase = await createClient();
  const update: Record<string, unknown> = { status };

  if (status === "cancelled" || status === "no_show") {
    const user = await getSessionUser();
    if (status === "cancelled") {
      update.cancelled_at = new Date().toISOString();
      update.cancelled_by = user?.id ?? null;
    }
  }

  const { data, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", appointmentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("appointments", error, "We could not update this appointment just now. Please try again.");
  }

  if (!data) {
    return { status: "error", message: "You do not have access to this appointment." };
  }

  revalidateAll();

  return { status: "success", message: "Appointment updated." };
}

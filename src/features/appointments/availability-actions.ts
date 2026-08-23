"use server";

import { revalidatePath } from "next/cache";

import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { availabilitySchema, availabilityToRow } from "@/lib/validation/availability";

/**
 * Doctor availability writes — admin only, enforced by row level security.
 */

function readAvailabilityForm(formData: FormData) {
  return {
    weekday: text(formData, "weekday") ?? "",
    startsAt: text(formData, "startsAt") ?? "",
    endsAt: text(formData, "endsAt") ?? "",
    slotMinutes: text(formData, "slotMinutes") ?? "",
    visitType: text(formData, "visitType") ?? null,
    branchId: text(formData, "branchId") ?? null,
  };
}

function overlapError(): FormState {
  return {
    status: "error",
    message: "This window overlaps another one already set for this doctor on this day.",
  };
}

export async function createAvailabilityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const doctorId = text(formData, "doctorId");
  if (!doctorId) return { status: "error", message: "We could not tell which doctor this is for." };

  const parsed = availabilitySchema.safeParse(readAvailabilityForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { data: doctor, error: doctorError } = await supabase
    .from("doctors")
    .select("organization_id")
    .eq("id", doctorId)
    .maybeSingle();

  if (doctorError || !doctor) return { status: "error", message: "That doctor could not be found." };

  const { error } = await supabase.from("doctor_availability").insert({
    ...availabilityToRow(parsed.data),
    doctor_id: doctorId,
    organization_id: doctor.organization_id,
  });

  if (error) {
    if (error.code === "23P01") return overlapError();
    return failure("doctor_availability", error, "We could not save this window just now. Please try again.");
  }

  revalidatePath("/admin/appointments/availability");
  return { status: "success", message: "Availability window added." };
}

export async function updateAvailabilityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const availabilityId = text(formData, "availabilityId");
  if (!availabilityId) return { status: "error", message: "We could not tell which window to update." };

  const parsed = availabilitySchema.safeParse(readAvailabilityForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctor_availability")
    .update(availabilityToRow(parsed.data))
    .eq("id", availabilityId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23P01") return overlapError();
    return failure("doctor_availability", error, "We could not save these changes just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this window." };

  revalidatePath("/admin/appointments/availability");
  return { status: "success", message: "Changes saved." };
}

export async function deleteAvailabilityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const availabilityId = text(formData, "availabilityId");
  if (!availabilityId) return { status: "error", message: "We could not tell which window to remove." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctor_availability")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", availabilityId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("doctor_availability", error, "We could not remove this window just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this window." };

  revalidatePath("/admin/appointments/availability");
  return { status: "success", message: "Availability window removed." };
}

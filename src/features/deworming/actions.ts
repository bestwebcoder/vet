"use server";

import { revalidatePath } from "next/cache";

import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { dewormingEntrySchema, dewormingEntryToRow } from "@/lib/validation/deworming";

/**
 * Deworming writes. Doctor-only, enforced by row level security. Same
 * appointment-scoped, editable, soft-deletable shape as vaccinations.
 */

function readDewormingForm(formData: FormData) {
  return {
    product: text(formData, "product") ?? "",
    activeIngredient: text(formData, "activeIngredient") ?? "",
    dose: text(formData, "dose") ?? "",
    route: text(formData, "route") ?? "",
    weightGrams: text(formData, "weightGrams") ?? "",
    dateAdministered: text(formData, "dateAdministered") ?? "",
    interval: text(formData, "interval") ?? "",
    customIntervalDays: text(formData, "customIntervalDays") ?? "",
    nextDueDate: text(formData, "nextDueDate") ?? "",
    notes: text(formData, "notes") ?? "",
  };
}

function revalidateDewormingPaths(appointmentId: string | undefined, petId: string | undefined) {
  if (appointmentId) revalidatePath(`/doctor/appointments/${appointmentId}/deworming`);
  if (petId) {
    revalidatePath(`/doctor/patients/${petId}/deworming`);
    revalidatePath(`/admin/patients/${petId}/deworming`);
    revalidatePath(`/client/pets/${petId}/deworming`);
  }
  revalidatePath("/doctor/deworming");
  revalidatePath("/admin/deworming");
  revalidatePath("/client/deworming");
}

export async function addDewormingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  const doctorId = text(formData, "doctorId");
  if (!appointmentId || !petId || !doctorId) {
    return { status: "error", message: "We could not tell which visit this deworming is for." };
  }

  const parsed = dewormingEntrySchema.safeParse(readDewormingForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("organization_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment) {
    return { status: "error", message: "That appointment could not be found." };
  }

  const { error } = await supabase.from("deworming_records").insert({
    appointment_id: appointmentId,
    pet_id: petId,
    doctor_id: doctorId,
    organization_id: appointment.organization_id,
    ...dewormingEntryToRow(parsed.data),
  });

  if (error) return failure("deworming_records", error, "We could not save that deworming record just now. Please try again.");

  revalidateDewormingPaths(appointmentId, petId);
  return { status: "success", message: "Deworming recorded." };
}

export async function updateDewormingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const dewormingId = text(formData, "dewormingId");
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!dewormingId) return { status: "error", message: "We could not tell which record to update." };

  const parsed = dewormingEntrySchema.safeParse(readDewormingForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deworming_records")
    .update(dewormingEntryToRow(parsed.data))
    .eq("id", dewormingId)
    .select("id")
    .maybeSingle();

  if (error) return failure("deworming_records", error, "We could not save those changes just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this record." };

  revalidateDewormingPaths(appointmentId, petId);
  return { status: "success", message: "Changes saved." };
}

export async function removeDewormingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const dewormingId = text(formData, "dewormingId");
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!dewormingId) return { status: "error", message: "We could not tell which record to remove." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deworming_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", dewormingId)
    .select("id")
    .maybeSingle();

  if (error) return failure("deworming_records", error, "We could not remove that record just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this record." };

  revalidateDewormingPaths(appointmentId, petId);
  return { status: "success", message: "Deworming record removed." };
}

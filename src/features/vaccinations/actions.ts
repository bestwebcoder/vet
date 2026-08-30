"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { vaccinationEntrySchema, vaccinationEntryToRow } from "@/lib/validation/vaccination";

/**
 * Vaccination writes. Doctor-only, enforced by row level security. Tied to
 * the appointment, same shape as diagnoses/diagnostics (Phase 4) — an
 * editable, soft-deletable row, not a versioned document.
 */

function readVaccinationForm(formData: FormData) {
  return {
    vaccinationScheduleId: text(formData, "vaccinationScheduleId") ?? "",
    vaccineName: text(formData, "vaccineName") ?? "",
    manufacturer: text(formData, "manufacturer") ?? "",
    batchNumber: text(formData, "batchNumber") ?? "",
    lotNumber: text(formData, "lotNumber") ?? "",
    expiryDate: text(formData, "expiryDate") ?? "",
    dateAdministered: text(formData, "dateAdministered") ?? "",
    dose: text(formData, "dose") ?? "",
    route: text(formData, "route") ?? "",
    site: text(formData, "site") ?? "",
    nextDueDate: text(formData, "nextDueDate") ?? "",
    notes: text(formData, "notes") ?? "",
  };
}

function revalidateVaccinationPaths(appointmentId: string | undefined, petId: string | undefined) {
  if (appointmentId) revalidatePath(`/doctor/appointments/${appointmentId}/vaccinations`);
  if (petId) {
    revalidatePath(`/doctor/patients/${petId}/vaccinations`);
    revalidatePath(`/admin/patients/${petId}/vaccinations`);
    revalidatePath(`/client/pets/${petId}/vaccinations`);
  }
  revalidatePath("/doctor/vaccinations");
  revalidatePath("/admin/vaccinations");
  revalidatePath("/client/vaccinations");
}

export async function addVaccinationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  const doctorId = text(formData, "doctorId");
  if (!appointmentId || !petId || !doctorId) {
    return { status: "error", message: "We could not tell which visit this vaccination is for." };
  }

  const parsed = vaccinationEntrySchema.safeParse(readVaccinationForm(formData));
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

  const { error } = await supabase.from("vaccinations").insert({
    appointment_id: appointmentId,
    pet_id: petId,
    doctor_id: doctorId,
    organization_id: appointment.organization_id,
    ...vaccinationEntryToRow(parsed.data),
  });

  if (error) return failure("vaccinations", error, "We could not save that vaccination just now. Please try again.");

  revalidateVaccinationPaths(appointmentId, petId);
  return { status: "success", message: "Vaccination recorded." };
}

export async function updateVaccinationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const vaccinationId = text(formData, "vaccinationId");
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!vaccinationId) return { status: "error", message: "We could not tell which vaccination to update." };

  const parsed = vaccinationEntrySchema.safeParse(readVaccinationForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vaccinations")
    .update(vaccinationEntryToRow(parsed.data))
    .eq("id", vaccinationId)
    .select("id")
    .maybeSingle();

  if (error) return failure("vaccinations", error, "We could not save those changes just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this vaccination." };

  revalidateVaccinationPaths(appointmentId, petId);
  return { status: "success", message: "Changes saved." };
}

export async function removeVaccinationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const vaccinationId = text(formData, "vaccinationId");
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!vaccinationId) return { status: "error", message: "We could not tell which vaccination to remove." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vaccinations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", vaccinationId)
    .select("id")
    .maybeSingle();

  if (error) return failure("vaccinations", error, "We could not remove that vaccination just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this vaccination." };

  revalidateVaccinationPaths(appointmentId, petId);
  return { status: "success", message: "Vaccination removed." };
}

/**
 * Removes a vaccination record from the practice-wide worklist.
 *
 * The doctor-side `removeVaccinationAction` above writes `deleted_at`
 * directly, which only a doctor's row level security policy allows. An
 * administrator correcting a mistaken entry goes through
 * `delete_vaccination` instead: the same soft delete, audited the same way,
 * but the one write an admin has on the row — the clinical fields stay the
 * attending veterinarian's (CLAUDE.md §3, §11).
 */
export async function deleteVaccinationRecordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const vaccinationId = text(formData, "vaccinationId");
  if (!vaccinationId) return { status: "error", message: "We could not tell which vaccination to remove." };

  const supabase = await createClient();

  // Read the record first so every screen showing it is revalidated, and so a
  // record that is already gone says so rather than surfacing a raw error.
  const { data: record, error: lookupError } = await supabase
    .from("vaccinations")
    .select("appointment_id, pet_id")
    .eq("id", vaccinationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError) {
    return failure("vaccinations", lookupError, "We could not remove that vaccination just now. Please try again.");
  }
  if (!record) return { status: "error", message: "That vaccination could not be found." };

  const { error } = await supabase.rpc("delete_vaccination", { p_vaccination_id: vaccinationId });

  if (error) return failure("vaccinations", error, "We could not remove that vaccination just now. Please try again.");

  revalidateVaccinationPaths(record.appointment_id, record.pet_id);
  return { status: "success", message: "Vaccination removed." };
}

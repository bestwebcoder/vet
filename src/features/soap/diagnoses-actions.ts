"use server";

import { revalidatePath } from "next/cache";

import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { diagnosisEntrySchema } from "@/lib/validation/soap";

/**
 * Diagnosis writes. Doctor-only, enforced by row level security. Tied to the
 * appointment rather than one SOAP version, so revising the note later does
 * not orphan a diagnosis already recorded.
 */

export async function addDiagnosisAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!appointmentId || !petId) {
    return { status: "error", message: "We could not tell which visit this diagnosis is for." };
  }

  const parsed = diagnosisEntrySchema.safeParse({
    kind: text(formData, "kind") ?? "",
    description: text(formData, "description") ?? "",
  });
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

  const { error } = await supabase.from("diagnoses").insert({
    appointment_id: appointmentId,
    pet_id: petId,
    organization_id: appointment.organization_id,
    kind: parsed.data.kind,
    description: parsed.data.description,
  });

  if (error) return failure("diagnoses", error, "We could not save that diagnosis just now. Please try again.");

  revalidatePath(`/doctor/appointments/${appointmentId}/soap`);
  revalidatePath(`/doctor/patients/${petId}/medical-history`);
  revalidatePath(`/admin/patients/${petId}/medical-history`);
  revalidatePath(`/client/pets/${petId}/medical-history`);

  return { status: "success", message: "Diagnosis added." };
}

export async function removeDiagnosisAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const diagnosisId = text(formData, "diagnosisId");
  const petId = text(formData, "petId");
  const appointmentId = text(formData, "appointmentId");
  if (!diagnosisId) return { status: "error", message: "We could not tell which diagnosis to remove." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnoses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", diagnosisId)
    .select("id")
    .maybeSingle();

  if (error) return failure("diagnoses", error, "We could not remove that diagnosis just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this diagnosis." };

  if (appointmentId) revalidatePath(`/doctor/appointments/${appointmentId}/soap`);
  if (petId) {
    revalidatePath(`/doctor/patients/${petId}/medical-history`);
    revalidatePath(`/admin/patients/${petId}/medical-history`);
    revalidatePath(`/client/pets/${petId}/medical-history`);
  }

  return { status: "success", message: "Diagnosis removed." };
}

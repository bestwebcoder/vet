"use server";

import { revalidatePath } from "next/cache";

import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { getPrescription } from "@/features/prescriptions/queries";
import { renderPrescriptionPdf } from "@/lib/prescription-pdf";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  prescriptionItemSchema,
  prescriptionItemToRow,
  prescriptionSchema,
  prescriptionToRow,
} from "@/lib/validation/prescription";

/**
 * Prescription writes. Row level security is the real boundary (clinical
 * authorship is doctor-only); these actions shape the write and generate the
 * finalized PDF.
 */

const REVALIDATE_PATHS = ["/doctor/prescriptions"];

function revalidatePrescription(petId: string, appointmentId: string) {
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  revalidatePath(`/doctor/appointments/${appointmentId}`);
  revalidatePath(`/doctor/appointments/${appointmentId}/prescription`);
  revalidatePath(`/doctor/patients/${petId}/prescriptions`);
  revalidatePath(`/admin/patients/${petId}/prescriptions`);
  revalidatePath(`/client/pets/${petId}/prescriptions`);
}

/** Gets the current prescription for this appointment, creating a draft if none exists yet. */
export async function createPrescriptionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  if (!appointmentId) return { status: "error", message: "We could not tell which appointment this is for." };

  const doctor = await getOwnDoctorRecord();
  if (doctor.status !== "ok" || !doctor.data) {
    return { status: "error", message: "Your doctor record could not be found." };
  }

  const supabase = await createClient();

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("pet_id, organization_id")
    .eq("id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (appointmentError || !appointment) {
    return { status: "error", message: "That appointment could not be found." };
  }

  const { data: hasFinalizedSoap } = await supabase.rpc("has_finalized_soap", { p_appointment_id: appointmentId });
  if (!hasFinalizedSoap) {
    return {
      status: "error",
      message: "Finalize the SOAP record for this visit before writing a prescription.",
    };
  }

  const { data: existing } = await supabase
    .from("prescriptions")
    .select("id")
    .eq("appointment_id", appointmentId)
    .is("superseded_at", null)
    .maybeSingle();

  if (existing) {
    return { status: "success", id: existing.id };
  }

  const { data: created, error } = await supabase
    .from("prescriptions")
    .insert({
      appointment_id: appointmentId,
      pet_id: appointment.pet_id,
      organization_id: appointment.organization_id,
      doctor_id: doctor.data.id,
    })
    .select("id")
    .single();

  if (error) return failure("prescriptions", error, "We could not start a prescription just now. Please try again.");

  revalidatePrescription(appointment.pet_id, appointmentId);
  return { status: "success", id: created.id };
}

function readItemForm(formData: FormData) {
  return {
    medicationId: text(formData, "medicationId") ?? null,
    drugName: text(formData, "drugName") ?? "",
    strength: text(formData, "strength") ?? "",
    formulation: text(formData, "formulation") ?? "",
    dosePerKg: text(formData, "dosePerKg") ?? "",
    doseUnit: text(formData, "doseUnit") ?? "",
    computedDose: text(formData, "computedDose") ?? "",
    route: text(formData, "route") ?? "",
    frequency: text(formData, "frequency") ?? "",
    duration: text(formData, "duration") ?? "",
    quantity: text(formData, "quantity") ?? "",
    instructions: text(formData, "instructions") ?? "",
  };
}

export async function addPrescriptionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const prescriptionId = text(formData, "prescriptionId");
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!prescriptionId || !appointmentId || !petId) {
    return { status: "error", message: "We could not tell which prescription this item belongs to." };
  }

  const parsed = prescriptionItemSchema.safeParse(readItemForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { data: maxSort } = await supabase
    .from("prescription_items")
    .select("sort_order")
    .eq("prescription_id", prescriptionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("prescription_items").insert({
    prescription_id: prescriptionId,
    ...prescriptionItemToRow(parsed.data),
    sort_order: (maxSort?.sort_order ?? 0) + 10,
  });

  if (error) {
    if (error.code === "23503" || error.message?.includes("finalized")) {
      return failure("prescriptions", error, "This prescription has already been finalized. Revise it to make changes.");
    }
    return failure("prescriptions", error, "We could not add that item just now. Please try again.");
  }

  revalidatePrescription(petId, appointmentId);
  return { status: "success", message: "Item added." };
}

export async function updatePrescriptionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const itemId = text(formData, "itemId");
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!itemId) return { status: "error", message: "We could not tell which item to update." };

  const parsed = prescriptionItemSchema.safeParse(readItemForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescription_items")
    .update(prescriptionItemToRow(parsed.data))
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) return failure("prescriptions", error, "We could not save that item just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this item." };

  if (appointmentId && petId) revalidatePrescription(petId, appointmentId);
  return { status: "success", message: "Item saved." };
}

export async function removePrescriptionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const itemId = text(formData, "itemId");
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!itemId) return { status: "error", message: "We could not tell which item to remove." };

  const supabase = await createClient();
  const { error } = await supabase.from("prescription_items").delete().eq("id", itemId);

  if (error) return failure("prescriptions", error, "We could not remove that item just now. Please try again.");

  if (appointmentId && petId) revalidatePrescription(petId, appointmentId);
  return { status: "success", message: "Item removed." };
}

/** Saves the header (draft only), or — with intent "finalize" — saves and finalizes in one step. */
export async function savePrescriptionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const prescriptionId = text(formData, "prescriptionId");
  const appointmentId = text(formData, "appointmentId");
  if (!prescriptionId || !appointmentId) {
    return { status: "error", message: "We could not tell which prescription this is." };
  }

  const isFinalizing = text(formData, "intent") === "finalize";

  const parsed = prescriptionSchema.safeParse({
    followUpDate: text(formData, "followUpDate") ?? "",
    instructions: text(formData, "instructions") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const row = prescriptionToRow(parsed.data);

  if (!isFinalizing) {
    const { data, error } = await supabase
      .from("prescriptions")
      .update(row)
      .eq("id", prescriptionId)
      .select("pet_id")
      .maybeSingle();

    if (error) return failure("prescriptions", error, "We could not save this prescription just now. Please try again.");
    if (!data) return { status: "error", message: "You do not have access to this prescription." };

    revalidatePrescription(data.pet_id, appointmentId);
    return { status: "success", message: "Saved." };
  }

  // Finalizing: save the header first, then read back the full record (with
  // items) to render the PDF from exactly what is about to be signed.
  const { error: saveError } = await supabase.from("prescriptions").update(row).eq("id", prescriptionId);
  if (saveError) {
    return failure("prescriptions", saveError, "We could not save this prescription just now. Please try again.");
  }

  const current = await getPrescription(prescriptionId);
  if (current.status === "error" || !current.data) {
    return { status: "error", message: "This prescription could not be found." };
  }

  if (current.data.items.length === 0) {
    return { status: "error", message: "Add at least one medication before finalizing." };
  }

  const pdfBytes = await renderPrescriptionPdf(current.data, supabase);
  const pdfPath = `${current.data.petId}/${prescriptionId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("prescription-pdfs")
    .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    return failure("prescriptions", uploadError, "We could not generate the prescription PDF just now. Please try again.");
  }

  const now = new Date().toISOString();
  const { error: finalizeError } = await supabase
    .from("prescriptions")
    .update({ status: "finalized", finalized_at: now, pdf_path: pdfPath, signed_at: now })
    .eq("id", prescriptionId);

  if (finalizeError) {
    return failure("prescriptions", finalizeError, "We could not finalize this prescription just now. Please try again.");
  }

  revalidatePrescription(current.data.petId, appointmentId);
  return { status: "success", message: "Prescription finalized.", id: prescriptionId };
}

/** Starts a new version of a finalized prescription, ready to edit as a draft. */
export async function revisePrescriptionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const prescriptionId = text(formData, "prescriptionId");
  if (!prescriptionId) return { status: "error", message: "We could not tell which prescription to revise." };

  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("revise_prescription", { p_prescription_id: prescriptionId });

  if (error) {
    return failure("prescriptions", error, "We could not start a revision just now. Please try again.");
  }

  const { data: created } = await supabase
    .from("prescriptions")
    .select("pet_id, appointment_id")
    .eq("id", newId)
    .maybeSingle();

  if (created) revalidatePrescription(created.pet_id, created.appointment_id);

  return { status: "success", message: "A new version has been started.", id: newId };
}

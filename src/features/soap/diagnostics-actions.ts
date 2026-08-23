"use server";

import { revalidatePath } from "next/cache";

import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { optionalText } from "@/lib/validation/common";
import { z } from "zod";

/**
 * Diagnostic test order/tracking writes. Doctor-only, enforced by row level
 * security. Tied to the appointment, same as diagnoses.
 */

const DIAGNOSTIC_STATUSES = ["ordered", "in_progress", "completed"] as const;

const createDiagnosticSchema = z.object({
  testName: z.string().trim().min(1, "Enter a test name").max(200, "Keep it under 200 characters"),
  testType: optionalText(100, "Test type"),
});

export async function createDiagnosticAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  const petId = text(formData, "petId");
  if (!appointmentId || !petId) {
    return { status: "error", message: "We could not tell which visit this test is for." };
  }

  const parsed = createDiagnosticSchema.safeParse({
    testName: text(formData, "testName") ?? "",
    testType: text(formData, "testType") ?? "",
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

  const { error } = await supabase.from("diagnostics").insert({
    appointment_id: appointmentId,
    pet_id: petId,
    organization_id: appointment.organization_id,
    test_name: parsed.data.testName,
    test_type: parsed.data.testType,
  });

  if (error) return failure("diagnostics", error, "We could not add that test just now. Please try again.");

  revalidatePath(`/doctor/appointments/${appointmentId}/soap`);
  revalidatePath(`/doctor/patients/${petId}/diagnostics`);
  revalidatePath(`/admin/patients/${petId}/diagnostics`);
  revalidatePath(`/client/pets/${petId}/diagnostics`);
  revalidatePath("/doctor/diagnostics");

  return { status: "success", message: "Test added." };
}

const updateDiagnosticSchema = z.object({
  status: z.enum(DIAGNOSTIC_STATUSES),
  resultNotes: optionalText(2000, "Result notes"),
  documentId: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null),
});

export async function updateDiagnosticAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const diagnosticId = text(formData, "diagnosticId");
  const petId = text(formData, "petId");
  const appointmentId = text(formData, "appointmentId");
  if (!diagnosticId) return { status: "error", message: "We could not tell which test to update." };

  const parsed = updateDiagnosticSchema.safeParse({
    status: text(formData, "status") ?? "",
    resultNotes: text(formData, "resultNotes") ?? "",
    documentId: text(formData, "documentId") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnostics")
    .update({
      status: parsed.data.status,
      result_notes: parsed.data.resultNotes,
      document_id: parsed.data.documentId,
    })
    .eq("id", diagnosticId)
    .select("id")
    .maybeSingle();

  if (error) return failure("diagnostics", error, "We could not update that test just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this test." };

  if (appointmentId) revalidatePath(`/doctor/appointments/${appointmentId}/soap`);
  if (petId) {
    revalidatePath(`/doctor/patients/${petId}/diagnostics`);
    revalidatePath(`/admin/patients/${petId}/diagnostics`);
    revalidatePath(`/client/pets/${petId}/diagnostics`);
  }
  revalidatePath("/doctor/diagnostics");

  return { status: "success", message: "Test updated." };
}

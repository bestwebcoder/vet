"use server";

import { revalidatePath } from "next/cache";

import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { soapRecordSchema, soapRecordToRow } from "@/lib/validation/soap";

/**
 * SOAP record writes.
 *
 * Row level security is the real boundary (clinical authorship is
 * doctor-only — see the Phase 4 migration); these actions shape the write
 * and translate failures into sentences safe to show a doctor.
 */

function readSoapForm(formData: FormData) {
  const field = (name: string) => text(formData, name) ?? "";

  return {
    chiefComplaint: field("chiefComplaint"),
    history: field("history"),
    duration: field("duration"),
    appetite: field("appetite"),
    waterIntake: field("waterIntake"),
    urination: field("urination"),
    defecation: field("defecation"),
    vomiting: field("vomiting"),
    diarrhea: field("diarrhea"),
    coughing: field("coughing"),
    sneezing: field("sneezing"),
    otherObservations: field("otherObservations"),

    temperatureCelsius: field("temperatureCelsius"),
    pulseBpm: field("pulseBpm"),
    respiratoryRateBpm: field("respiratoryRateBpm"),
    weightKg: field("weightKg"),
    bodyConditionScore: field("bodyConditionScore"),
    mucousMembrane: field("mucousMembrane"),
    capillaryRefillTime: field("capillaryRefillTime"),
    hydrationStatus: field("hydrationStatus"),

    generalAppearance: field("generalAppearance"),
    examEyes: field("examEyes"),
    examEars: field("examEars"),
    examNose: field("examNose"),
    examOralCavity: field("examOralCavity"),
    examCardiovascular: field("examCardiovascular"),
    examRespiratory: field("examRespiratory"),
    examGastrointestinal: field("examGastrointestinal"),
    examUrinary: field("examUrinary"),
    examReproductive: field("examReproductive"),
    examMusculoskeletal: field("examMusculoskeletal"),
    examNeurological: field("examNeurological"),
    examSkin: field("examSkin"),
    examLymphNodes: field("examLymphNodes"),
    examNotes: field("examNotes"),

    clinicalAssessment: field("clinicalAssessment"),
    problemList: field("problemList"),

    treatment: field("treatment"),
    medication: field("medication"),
    diagnosticsPlan: field("diagnosticsPlan"),
    diet: field("diet"),
    hospitalization: field("hospitalization"),
    followUpNeeded: formData.get("followUpNeeded") === "on",
    followUpNotes: field("followUpNotes"),
    clientInstructions: field("clientInstructions"),
  };
}

const REVALIDATE_PATHS = ["/doctor/soap", "/doctor/follow-ups"];

function revalidateSoap(petId: string, appointmentId: string) {
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  revalidatePath(`/doctor/appointments/${appointmentId}`);
  revalidatePath(`/doctor/appointments/${appointmentId}/soap`);
  revalidatePath(`/doctor/patients/${petId}/visits`);
  revalidatePath(`/admin/patients/${petId}/visits`);
  revalidatePath(`/client/pets/${petId}/visits`);
}

/**
 * Creates the draft on first save, updates it in place after that, or —
 * when `intent` is "finalize" — does the same save and then finalizes in
 * one step. One action so the form needs only one `useActionState` hook and
 * two submit buttons (`name="intent"`), the same shape as the appointment
 * status buttons in Phase 3.
 */
export async function saveSoapAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const appointmentId = text(formData, "appointmentId");
  if (!appointmentId) return { status: "error", message: "We could not tell which appointment this is for." };

  const isFinalizing = text(formData, "intent") === "finalize";

  const parsed = soapRecordSchema.safeParse(readSoapForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  if (isFinalizing && (!parsed.data.chiefComplaint || !parsed.data.clinicalAssessment)) {
    return {
      status: "error",
      message: "A chief complaint and a clinical assessment are required to finalize a record.",
      fieldErrors: {
        ...(parsed.data.chiefComplaint ? {} : { chiefComplaint: ["Required to finalize"] }),
        ...(parsed.data.clinicalAssessment ? {} : { clinicalAssessment: ["Required to finalize"] }),
      },
    };
  }

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

  const { data: existing } = await supabase
    .from("soap_records")
    .select("id, status")
    .eq("appointment_id", appointmentId)
    .is("superseded_at", null)
    .maybeSingle();

  if (existing?.status === "finalized") {
    return {
      status: "error",
      message: "This record is already finalized. Revise it to make further changes.",
    };
  }

  const row = soapRecordToRow(parsed.data);
  const finalizeFields = isFinalizing ? { status: "finalized", finalized_at: new Date().toISOString() } : {};

  if (existing) {
    const { error } = await supabase
      .from("soap_records")
      .update({ ...row, ...finalizeFields })
      .eq("id", existing.id);

    if (error) return failure("soap", error, "We could not save this record just now. Please try again.");

    revalidateSoap(appointment.pet_id, appointmentId);
    return {
      status: "success",
      message: isFinalizing ? "SOAP record finalized." : "Draft saved.",
      id: existing.id,
    };
  }

  const { data: created, error } = await supabase
    .from("soap_records")
    .insert({
      appointment_id: appointmentId,
      pet_id: appointment.pet_id,
      organization_id: appointment.organization_id,
      doctor_id: doctor.data.id,
      ...row,
      ...finalizeFields,
    })
    .select("id")
    .single();

  if (error) return failure("soap", error, "We could not save this record just now. Please try again.");

  revalidateSoap(appointment.pet_id, appointmentId);
  return {
    status: "success",
    message: isFinalizing ? "SOAP record finalized." : "Draft saved.",
    id: created.id,
  };
}

/** Starts a new version of a finalized record, ready to edit as a draft. */
export async function reviseSoapAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const soapRecordId = text(formData, "soapRecordId");
  if (!soapRecordId) return { status: "error", message: "We could not tell which record to revise." };

  const supabase = await createClient();

  const { data: newId, error } = await supabase.rpc("revise_soap_record", { p_soap_record_id: soapRecordId });

  if (error) {
    return failure("soap", error, "We could not start a revision just now. Please try again.");
  }

  const { data: created } = await supabase
    .from("soap_records")
    .select("pet_id, appointment_id")
    .eq("id", newId)
    .maybeSingle();

  if (created) revalidateSoap(created.pet_id, created.appointment_id);

  return { status: "success", message: "A new version has been started.", id: newId };
}

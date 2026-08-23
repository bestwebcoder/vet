import { formatWeight } from "@/lib/units";

import { createClient } from "@/lib/supabase/server";

/**
 * SOAP record, diagnosis and diagnostic reads.
 *
 * Every query runs under the caller's own row level security policy: a
 * client's query returns only the current finalized version of a record (see
 * `soap_records_select` in the Phase 4 migration), a doctor's or admin's
 * returns every version. Nothing here re-implements that scoping.
 */

const SOAP_COLUMNS = `
  id, appointment_id, pet_id, organization_id, doctor_id, version, status,
  finalized_at, superseded_at, created_at, updated_at,
  chief_complaint, history, duration, appetite, water_intake, urination,
  defecation, vomiting, diarrhea, coughing, sneezing, other_observations,
  temperature_celsius, pulse_bpm, respiratory_rate_bpm, weight_grams,
  body_condition_score, mucous_membrane, capillary_refill_time, hydration_status,
  general_appearance, exam_eyes, exam_ears, exam_nose, exam_oral_cavity,
  exam_cardiovascular, exam_respiratory, exam_gastrointestinal, exam_urinary,
  exam_reproductive, exam_musculoskeletal, exam_neurological, exam_skin,
  exam_lymph_nodes, exam_notes,
  clinical_assessment, problem_list,
  treatment, medication, diagnostics_plan, diet, hospitalization,
  follow_up_needed, follow_up_notes, follow_up_scheduled_at, client_instructions,
  pet:pets (id, name),
  doctor:doctors (id, user:user_id (full_name)),
  appointment:appointments (id, starts_at)
`;

type One<T> = T | T[] | null;
function one<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type SoapRecordDetail = {
  id: string;
  appointmentId: string;
  petId: string;
  petName: string;
  organizationId: string;
  doctorId: string;
  doctorName: string;
  version: number;
  status: "draft" | "finalized";
  finalizedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  appointmentStartsAt: string | null;

  chiefComplaint: string | null;
  history: string | null;
  duration: string | null;
  appetite: string | null;
  waterIntake: string | null;
  urination: string | null;
  defecation: string | null;
  vomiting: string | null;
  diarrhea: string | null;
  coughing: string | null;
  sneezing: string | null;
  otherObservations: string | null;

  temperatureCelsius: number | null;
  pulseBpm: number | null;
  respiratoryRateBpm: number | null;
  weightGrams: number | null;
  weight: string | null;
  bodyConditionScore: number | null;
  mucousMembrane: string | null;
  capillaryRefillTime: string | null;
  hydrationStatus: string | null;

  generalAppearance: string | null;
  examEyes: string | null;
  examEars: string | null;
  examNose: string | null;
  examOralCavity: string | null;
  examCardiovascular: string | null;
  examRespiratory: string | null;
  examGastrointestinal: string | null;
  examUrinary: string | null;
  examReproductive: string | null;
  examMusculoskeletal: string | null;
  examNeurological: string | null;
  examSkin: string | null;
  examLymphNodes: string | null;
  examNotes: string | null;

  clinicalAssessment: string | null;
  problemList: string | null;

  treatment: string | null;
  medication: string | null;
  diagnosticsPlan: string | null;
  diet: string | null;
  hospitalization: string | null;
  followUpNeeded: boolean;
  followUpNotes: string | null;
  followUpScheduledAt: string | null;
  clientInstructions: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toDetail(row: any): SoapRecordDetail {
  const pet = one<any>(row.pet);
  const doctor = one<any>(row.doctor);
  const doctorUser = doctor ? one<any>(doctor.user) : null;
  const appointment = one<any>(row.appointment);

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    petId: row.pet_id,
    petName: pet?.name ?? "Unknown patient",
    organizationId: row.organization_id,
    doctorId: row.doctor_id,
    doctorName: doctorUser?.full_name ?? "Unknown doctor",
    version: row.version,
    status: row.status,
    finalizedAt: row.finalized_at,
    supersededAt: row.superseded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appointmentStartsAt: appointment?.starts_at ?? null,

    chiefComplaint: row.chief_complaint,
    history: row.history,
    duration: row.duration,
    appetite: row.appetite,
    waterIntake: row.water_intake,
    urination: row.urination,
    defecation: row.defecation,
    vomiting: row.vomiting,
    diarrhea: row.diarrhea,
    coughing: row.coughing,
    sneezing: row.sneezing,
    otherObservations: row.other_observations,

    temperatureCelsius: row.temperature_celsius,
    pulseBpm: row.pulse_bpm,
    respiratoryRateBpm: row.respiratory_rate_bpm,
    weightGrams: row.weight_grams,
    weight: formatWeight(row.weight_grams),
    bodyConditionScore: row.body_condition_score,
    mucousMembrane: row.mucous_membrane,
    capillaryRefillTime: row.capillary_refill_time,
    hydrationStatus: row.hydration_status,

    generalAppearance: row.general_appearance,
    examEyes: row.exam_eyes,
    examEars: row.exam_ears,
    examNose: row.exam_nose,
    examOralCavity: row.exam_oral_cavity,
    examCardiovascular: row.exam_cardiovascular,
    examRespiratory: row.exam_respiratory,
    examGastrointestinal: row.exam_gastrointestinal,
    examUrinary: row.exam_urinary,
    examReproductive: row.exam_reproductive,
    examMusculoskeletal: row.exam_musculoskeletal,
    examNeurological: row.exam_neurological,
    examSkin: row.exam_skin,
    examLymphNodes: row.exam_lymph_nodes,
    examNotes: row.exam_notes,

    clinicalAssessment: row.clinical_assessment,
    problemList: row.problem_list,

    treatment: row.treatment,
    medication: row.medication,
    diagnosticsPlan: row.diagnostics_plan,
    diet: row.diet,
    hospitalization: row.hospitalization,
    followUpNeeded: row.follow_up_needed,
    followUpNotes: row.follow_up_notes,
    followUpScheduledAt: row.follow_up_scheduled_at,
    clientInstructions: row.client_instructions,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

/** The current version of this appointment's SOAP note, if one exists. */
export async function getCurrentSoapRecord(appointmentId: string): Promise<Result<SoapRecordDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("soap_records")
    .select(SOAP_COLUMNS)
    .eq("appointment_id", appointmentId)
    .is("superseded_at", null)
    .maybeSingle();

  if (error) {
    console.error("[soap] current record failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toDetail(data) : null };
}

export async function getSoapRecord(id: string): Promise<Result<SoapRecordDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("soap_records").select(SOAP_COLUMNS).eq("id", id).maybeSingle();

  if (error) {
    console.error("[soap] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toDetail(data) : null };
}

/** Every version of this appointment's SOAP note, oldest first. */
export async function listSoapVersions(appointmentId: string): Promise<Result<SoapRecordDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("soap_records")
    .select(SOAP_COLUMNS)
    .eq("appointment_id", appointmentId)
    .order("version");

  if (error) {
    console.error("[soap] version list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

/** The current version of every SOAP record for this pet, newest first — Visit History. */
export async function listSoapRecordsForPet(petId: string): Promise<Result<SoapRecordDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("soap_records")
    .select(SOAP_COLUMNS)
    .eq("pet_id", petId)
    .is("superseded_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[soap] pet list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

/** Draft SOAP records authored by a doctor — the "Records to complete" card. */
export async function listDraftSoapRecordsForDoctor(doctorId: string): Promise<Result<SoapRecordDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("soap_records")
    .select(SOAP_COLUMNS)
    .eq("doctor_id", doctorId)
    .eq("status", "draft")
    .is("superseded_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[soap] draft list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

/** Finalized records that flagged a follow-up but have not had one booked yet. */
export async function listFollowUpsDueForDoctor(doctorId: string): Promise<Result<SoapRecordDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("soap_records")
    .select(SOAP_COLUMNS)
    .eq("doctor_id", doctorId)
    .eq("status", "finalized")
    .eq("follow_up_needed", true)
    .is("superseded_at", null)
    .is("follow_up_scheduled_at", null)
    .order("finalized_at", { ascending: false });

  if (error) {
    console.error("[soap] follow-up list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

export type Diagnosis = {
  id: string;
  appointmentId: string;
  kind: "differential" | "final";
  description: string;
  createdAt: string;
};

export async function listDiagnosesForPet(petId: string): Promise<Result<Diagnosis[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diagnoses")
    .select("id, appointment_id, kind, description, created_at")
    .eq("pet_id", petId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[soap] diagnosis list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      kind: row.kind,
      description: row.description,
      createdAt: row.created_at,
    })),
  };
}

export async function listDiagnosesForAppointment(appointmentId: string): Promise<Result<Diagnosis[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diagnoses")
    .select("id, appointment_id, kind, description, created_at")
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("created_at");

  if (error) {
    console.error("[soap] diagnosis list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      kind: row.kind,
      description: row.description,
      createdAt: row.created_at,
    })),
  };
}

export type DiagnosticTest = {
  id: string;
  appointmentId: string;
  petId: string;
  petName: string;
  testName: string;
  testType: string | null;
  status: "ordered" | "in_progress" | "completed";
  orderedAt: string;
  resultNotes: string | null;
  documentId: string | null;
  documentFileName: string | null;
  documentStoragePath: string | null;
};

const DIAGNOSTIC_COLUMNS = `
  id, appointment_id, pet_id, test_name, test_type, status, ordered_at, result_notes, document_id,
  document:documents (id, file_name, storage_path),
  pet:pets (name)
`;

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toDiagnostic(row: any): DiagnosticTest {
  const document = Array.isArray(row.document) ? (row.document[0] ?? null) : row.document;
  const pet = Array.isArray(row.pet) ? (row.pet[0] ?? null) : row.pet;

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    petId: row.pet_id,
    petName: pet?.name ?? "Unknown patient",
    testName: row.test_name,
    testType: row.test_type,
    status: row.status as DiagnosticTest["status"],
    orderedAt: row.ordered_at,
    resultNotes: row.result_notes,
    documentId: row.document_id,
    documentFileName: document?.file_name ?? null,
    documentStoragePath: document?.storage_path ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listDiagnosticsForPet(petId: string): Promise<Result<DiagnosticTest[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diagnostics")
    .select(DIAGNOSTIC_COLUMNS)
    .eq("pet_id", petId)
    .is("deleted_at", null)
    .order("ordered_at", { ascending: false });

  if (error) {
    console.error("[soap] diagnostics list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDiagnostic) };
}

export async function listDiagnosticsForAppointment(appointmentId: string): Promise<Result<DiagnosticTest[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diagnostics")
    .select(DIAGNOSTIC_COLUMNS)
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("ordered_at", { ascending: false });

  if (error) {
    console.error("[soap] diagnostics list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDiagnostic) };
}

/** Every open test across the practice, oldest first — the `/doctor/diagnostics` queue. */
export async function listOpenDiagnosticsQueue(): Promise<Result<DiagnosticTest[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diagnostics")
    .select(DIAGNOSTIC_COLUMNS)
    .neq("status", "completed")
    .is("deleted_at", null)
    .order("ordered_at");

  if (error) {
    console.error("[soap] diagnostics queue failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDiagnostic) };
}

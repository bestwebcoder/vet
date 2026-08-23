import { formatWeight } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";

/**
 * Prescription reads. Every query runs under the caller's own row level
 * security policy — a client's query returns only the current finalized
 * version, a doctor's or admin's returns every version. Same shape as
 * `soap/queries.ts`.
 */

const PRESCRIPTION_COLUMNS = `
  id, appointment_id, pet_id, organization_id, doctor_id, version, status,
  finalized_at, superseded_at, prescription_number, follow_up_date,
  instructions, pdf_path, signed_at, created_at, updated_at,
  pet:pets (id, name, species:species_id (name), breed:breeds (name)),
  doctor:doctors (id, registration_number, signature_url, user:user_id (full_name)),
  appointment:appointments (id, starts_at, client:clients (id, full_name, phone))
`;

type One<T> = T | T[] | null;
function one<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type PrescriptionItem = {
  id: string;
  medicationId: string | null;
  drugName: string;
  strength: string | null;
  formulation: string | null;
  dosePerKg: number | null;
  doseUnit: string | null;
  computedDose: number | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
  sortOrder: number;
};

export type PrescriptionDetail = {
  id: string;
  appointmentId: string;
  petId: string;
  petName: string;
  speciesName: string | null;
  breedName: string | null;
  organizationId: string;
  doctorId: string;
  doctorName: string;
  doctorRegistrationNumber: string | null;
  doctorSignaturePath: string | null;
  clientName: string;
  clientPhone: string;
  visitDate: string | null;
  version: number;
  status: "draft" | "finalized";
  finalizedAt: string | null;
  supersededAt: string | null;
  prescriptionNumber: string;
  followUpDate: string | null;
  instructions: string | null;
  pdfPath: string | null;
  signedAt: string | null;
  createdAt: string;
  items: PrescriptionItem[];
};

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toDetail(row: any, items: PrescriptionItem[]): PrescriptionDetail {
  const pet = one<any>(row.pet);
  const species = pet ? one<any>(pet.species) : null;
  const breed = pet ? one<any>(pet.breed) : null;
  const doctor = one<any>(row.doctor);
  const doctorUser = doctor ? one<any>(doctor.user) : null;
  const appointment = one<any>(row.appointment);
  const client = appointment ? one<any>(appointment.client) : null;

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    petId: row.pet_id,
    petName: pet?.name ?? "Unknown patient",
    speciesName: species?.name ?? null,
    breedName: breed?.name ?? null,
    organizationId: row.organization_id,
    doctorId: row.doctor_id,
    doctorName: doctorUser?.full_name ?? "Unknown doctor",
    doctorRegistrationNumber: doctor?.registration_number ?? null,
    doctorSignaturePath: doctor?.signature_url ?? null,
    clientName: client?.full_name ?? "Unknown client",
    clientPhone: client?.phone ?? "",
    visitDate: appointment?.starts_at ?? null,
    version: row.version,
    status: row.status,
    finalizedAt: row.finalized_at,
    supersededAt: row.superseded_at,
    prescriptionNumber: row.prescription_number,
    followUpDate: row.follow_up_date,
    instructions: row.instructions,
    pdfPath: row.pdf_path,
    signedAt: row.signed_at,
    createdAt: row.created_at,
    items,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function toItem(row: {
  id: string;
  medication_id: string | null;
  drug_name: string;
  strength: string | null;
  formulation: string | null;
  dose_per_kg: number | null;
  dose_unit: string | null;
  computed_dose: number | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
  sort_order: number;
}): PrescriptionItem {
  return {
    id: row.id,
    medicationId: row.medication_id,
    drugName: row.drug_name,
    strength: row.strength,
    formulation: row.formulation,
    dosePerKg: row.dose_per_kg,
    doseUnit: row.dose_unit,
    computedDose: row.computed_dose,
    route: row.route,
    frequency: row.frequency,
    duration: row.duration,
    quantity: row.quantity,
    instructions: row.instructions,
    sortOrder: row.sort_order,
  };
}

const ITEM_COLUMNS =
  "id, medication_id, drug_name, strength, formulation, dose_per_kg, dose_unit, computed_dose, route, frequency, duration, quantity, instructions, sort_order";

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

async function itemsFor(prescriptionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescription_items")
    .select(ITEM_COLUMNS)
    .eq("prescription_id", prescriptionId)
    .order("sort_order");

  if (error) {
    console.error("[prescriptions] item list failed", error);
    return [];
  }

  return (data ?? []).map(toItem);
}

export async function getCurrentPrescription(appointmentId: string): Promise<Result<PrescriptionDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prescriptions")
    .select(PRESCRIPTION_COLUMNS)
    .eq("appointment_id", appointmentId)
    .is("superseded_at", null)
    .maybeSingle();

  if (error) {
    console.error("[prescriptions] current failed", error);
    return { status: "error" };
  }

  if (!data) return { status: "ok", data: null };

  return { status: "ok", data: toDetail(data, await itemsFor(data.id)) };
}

export async function getPrescription(id: string): Promise<Result<PrescriptionDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("prescriptions").select(PRESCRIPTION_COLUMNS).eq("id", id).maybeSingle();

  if (error) {
    console.error("[prescriptions] get failed", error);
    return { status: "error" };
  }

  if (!data) return { status: "ok", data: null };

  return { status: "ok", data: toDetail(data, await itemsFor(data.id)) };
}

export async function listPrescriptionVersions(appointmentId: string): Promise<Result<{ id: string; version: number }[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prescriptions")
    .select("id, version")
    .eq("appointment_id", appointmentId)
    .order("version");

  if (error) {
    console.error("[prescriptions] version list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ?? [] };
}

/** The current version of every prescription for this pet, newest first — the Prescriptions tab. */
export async function listPrescriptionsForPet(petId: string): Promise<Result<PrescriptionDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prescriptions")
    .select(PRESCRIPTION_COLUMNS)
    .eq("pet_id", petId)
    .is("superseded_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prescriptions] pet list failed", error);
    return { status: "error" };
  }

  const withItems = await Promise.all((data ?? []).map(async (row) => toDetail(row, await itemsFor(row.id))));
  return { status: "ok", data: withItems };
}

export async function listDraftPrescriptionsForDoctor(doctorId: string): Promise<Result<PrescriptionDetail[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prescriptions")
    .select(PRESCRIPTION_COLUMNS)
    .eq("doctor_id", doctorId)
    .eq("status", "draft")
    .is("superseded_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prescriptions] draft list failed", error);
    return { status: "error" };
  }

  const withItems = await Promise.all((data ?? []).map(async (row) => toDetail(row, await itemsFor(row.id))));
  return { status: "ok", data: withItems };
}

export type MedicationOption = {
  id: string;
  name: string;
  genericName: string | null;
  commonStrength: string | null;
  formulation: string | null;
  defaultRoute: string | null;
};

export async function listMedications(): Promise<MedicationOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("medications")
    .select("id, name, generic_name, common_strength, formulation, default_route")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[prescriptions] medication list failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    genericName: row.generic_name,
    commonStrength: row.common_strength,
    formulation: row.formulation,
    defaultRoute: row.default_route,
  }));
}

/**
 * The weight to base a dose calculation on: the visit's own finalized SOAP
 * record if it captured one, else the patient's current recorded weight.
 * Never invented — a null here means "genuinely unrecorded".
 */
export async function resolveVisitWeightGrams(appointmentId: string, petId: string): Promise<number | null> {
  const supabase = await createClient();

  const { data: soap } = await supabase
    .from("soap_records")
    .select("weight_grams")
    .eq("appointment_id", appointmentId)
    .is("superseded_at", null)
    .maybeSingle();

  if (soap?.weight_grams) return soap.weight_grams;

  const { data: pet } = await supabase.from("pets").select("weight_grams").eq("id", petId).maybeSingle();
  return pet?.weight_grams ?? null;
}

export async function formattedVisitWeight(appointmentId: string, petId: string): Promise<string | null> {
  return formatWeight(await resolveVisitWeightGrams(appointmentId, petId));
}

/** A short-lived link to a stored prescription PDF. */
export async function signedPrescriptionPdfUrl(path: string, seconds = 300): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("prescription-pdfs").createSignedUrl(path, seconds);

  if (error) {
    console.error("[prescriptions] signing pdf url failed", error);
    return null;
  }

  return data.signedUrl;
}

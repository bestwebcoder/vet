import { createClient } from "@/lib/supabase/server";

/**
 * Vaccination reads. Doctor-only writes are enforced by row level security;
 * every query here runs under the caller's own policy — a client's query
 * returns only their own pets' records (see `vaccinations_select`).
 */

export type VaccinationRecord = {
  id: string;
  appointmentId: string;
  petId: string;
  petName: string;
  vaccinationScheduleId: string | null;
  vaccineName: string;
  manufacturer: string | null;
  batchNumber: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  dateAdministered: string;
  dose: string | null;
  route: string | null;
  site: string | null;
  nextDueDate: string | null;
  notes: string | null;
};

const VACCINATION_COLUMNS = `
  id, appointment_id, pet_id, vaccination_schedule_id, vaccine_name, manufacturer,
  batch_number, lot_number, expiry_date, date_administered, dose, route, site,
  next_due_date, notes,
  pet:pets (name)
`;

type Related = { name: string } | { name: string }[] | null;
function one(value: Related) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toRecord(row: any): VaccinationRecord {
  const pet = one(row.pet);

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    petId: row.pet_id,
    petName: pet?.name ?? "Unknown patient",
    vaccinationScheduleId: row.vaccination_schedule_id,
    vaccineName: row.vaccine_name,
    manufacturer: row.manufacturer,
    batchNumber: row.batch_number,
    lotNumber: row.lot_number,
    expiryDate: row.expiry_date,
    dateAdministered: row.date_administered,
    dose: row.dose,
    route: row.route,
    site: row.site,
    nextDueDate: row.next_due_date,
    notes: row.notes,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export async function listVaccinationsForAppointment(appointmentId: string): Promise<Result<VaccinationRecord[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vaccinations")
    .select(VACCINATION_COLUMNS)
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("date_administered", { ascending: false });

  if (error) {
    console.error("[vaccinations] appointment list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toRecord) };
}

export async function listVaccinationsForPet(petId: string): Promise<Result<VaccinationRecord[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vaccinations")
    .select(VACCINATION_COLUMNS)
    .eq("pet_id", petId)
    .is("deleted_at", null)
    .order("date_administered", { ascending: false });

  if (error) {
    console.error("[vaccinations] pet list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toRecord) };
}

export type PetVaccinationStatus = {
  petId: string;
  vaccineName: string;
  nextDueDate: string | null;
};

/** The most recently administered vaccination per pet — feeds PetCard and worklists. */
export async function listPetVaccinationStatuses(petIds: string[]): Promise<Result<PetVaccinationStatus[]>> {
  if (petIds.length === 0) return { status: "ok", data: [] };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pet_vaccination_status")
    .select("pet_id, vaccine_name, next_due_date")
    .in("pet_id", petIds);

  if (error) {
    console.error("[vaccinations] status list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({
      petId: row.pet_id,
      vaccineName: row.vaccine_name,
      nextDueDate: row.next_due_date,
    })),
  };
}

export type PetDueVaccination = {
  petId: string;
  petName: string;
  vaccineName: string;
  nextDueDate: string | null;
};

/**
 * Every pet due or overdue (within 30 days — the widest window any
 * worklist actually filters to; see src/lib/due-window.ts) for its next
 * vaccination, practice-wide — the doctor/admin worklists. Pushed down into
 * the query itself: without this, the view returns one row per pet the
 * practice has EVER vaccinated, unbounded, most of it immediately
 * discarded by every caller's own due-status filter. A plain view carries
 * no foreign key metadata for PostgREST to embed through, so pet names are
 * resolved in a second query and merged here.
 */
export async function listPracticeVaccinationStatuses(): Promise<Result<PetDueVaccination[]>> {
  const supabase = await createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);

  const { data, error } = await supabase
    .from("pet_vaccination_status")
    .select("pet_id, vaccine_name, next_due_date")
    .not("next_due_date", "is", null)
    .lte("next_due_date", cutoff.toISOString().slice(0, 10));

  if (error) {
    console.error("[vaccinations] practice status list failed", error);
    return { status: "error" };
  }

  const rows = data ?? [];
  if (rows.length === 0) return { status: "ok", data: [] };

  const petIds = rows.map((row) => row.pet_id);
  const { data: pets, error: petsError } = await supabase.from("pets").select("id, name").in("id", petIds);

  if (petsError) {
    console.error("[vaccinations] practice status pet lookup failed", petsError);
    return { status: "error" };
  }

  const nameById = new Map((pets ?? []).map((pet) => [pet.id, pet.name]));

  return {
    status: "ok",
    data: rows.map((row) => ({
      petId: row.pet_id,
      petName: nameById.get(row.pet_id) ?? "Unknown patient",
      vaccineName: row.vaccine_name,
      nextDueDate: row.next_due_date,
    })),
  };
}

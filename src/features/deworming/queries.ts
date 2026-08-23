import type { DewormingInterval } from "@/lib/deworming-interval";
import { createClient } from "@/lib/supabase/server";
import { formatWeight } from "@/lib/units";

/**
 * Deworming record reads. Doctor-only writes are enforced by row level
 * security; every query here runs under the caller's own policy.
 */

export type DewormingRecord = {
  id: string;
  appointmentId: string;
  petId: string;
  petName: string;
  product: string;
  activeIngredient: string | null;
  dose: string | null;
  route: string | null;
  weightGrams: number | null;
  weight: string | null;
  dateAdministered: string;
  interval: DewormingInterval;
  customIntervalDays: number | null;
  nextDueDate: string;
  notes: string | null;
};

const DEWORMING_COLUMNS = `
  id, appointment_id, pet_id, product, active_ingredient, dose, route, weight_grams,
  date_administered, interval, custom_interval_days, next_due_date, notes,
  pet:pets (name)
`;

type Related = { name: string } | { name: string }[] | null;
function one(value: Related) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toRecord(row: any): DewormingRecord {
  const pet = one(row.pet);

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    petId: row.pet_id,
    petName: pet?.name ?? "Unknown patient",
    product: row.product,
    activeIngredient: row.active_ingredient,
    dose: row.dose,
    route: row.route,
    weightGrams: row.weight_grams,
    weight: formatWeight(row.weight_grams),
    dateAdministered: row.date_administered,
    interval: row.interval,
    customIntervalDays: row.custom_interval_days,
    nextDueDate: row.next_due_date,
    notes: row.notes,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export async function listDewormingForAppointment(appointmentId: string): Promise<Result<DewormingRecord[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("deworming_records")
    .select(DEWORMING_COLUMNS)
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("date_administered", { ascending: false });

  if (error) {
    console.error("[deworming] appointment list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toRecord) };
}

export async function listDewormingForPet(petId: string): Promise<Result<DewormingRecord[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("deworming_records")
    .select(DEWORMING_COLUMNS)
    .eq("pet_id", petId)
    .is("deleted_at", null)
    .order("date_administered", { ascending: false });

  if (error) {
    console.error("[deworming] pet list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toRecord) };
}

export type PetDewormingStatus = {
  petId: string;
  product: string;
  nextDueDate: string;
};

/** The most recently administered deworming per pet — feeds PetCard and worklists. */
export async function listPetDewormingStatuses(petIds: string[]): Promise<Result<PetDewormingStatus[]>> {
  if (petIds.length === 0) return { status: "ok", data: [] };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pet_deworming_status")
    .select("pet_id, product, next_due_date")
    .in("pet_id", petIds);

  if (error) {
    console.error("[deworming] status list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({
      petId: row.pet_id,
      product: row.product,
      nextDueDate: row.next_due_date,
    })),
  };
}

export type PetDueDeworming = {
  petId: string;
  petName: string;
  product: string;
  nextDueDate: string;
};

/**
 * Every pet's current deworming status, practice-wide — the doctor/admin
 * worklists. Pet names are resolved separately: a plain view carries no
 * foreign key metadata for PostgREST to embed through.
 */
export async function listPracticeDewormingStatuses(): Promise<Result<PetDueDeworming[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("pet_deworming_status").select("pet_id, product, next_due_date");

  if (error) {
    console.error("[deworming] practice status list failed", error);
    return { status: "error" };
  }

  const rows = data ?? [];
  if (rows.length === 0) return { status: "ok", data: [] };

  const petIds = rows.map((row) => row.pet_id);
  const { data: pets, error: petsError } = await supabase.from("pets").select("id, name").in("id", petIds);

  if (petsError) {
    console.error("[deworming] practice status pet lookup failed", petsError);
    return { status: "error" };
  }

  const nameById = new Map((pets ?? []).map((pet) => [pet.id, pet.name]));

  return {
    status: "ok",
    data: rows.map((row) => ({
      petId: row.pet_id,
      petName: nameById.get(row.pet_id) ?? "Unknown patient",
      product: row.product,
      nextDueDate: row.next_due_date,
    })),
  };
}

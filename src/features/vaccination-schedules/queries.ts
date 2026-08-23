import { createClient } from "@/lib/supabase/server";

/**
 * Vaccination schedule catalog reads. §6.3 — administrator-configurable,
 * never hard-coded, exactly like `src/features/services/queries.ts`.
 */

export type VaccinationSchedule = {
  id: string;
  speciesId: string | null;
  speciesName: string | null;
  vaccineName: string;
  intervalValue: number;
  intervalUnit: "days" | "weeks" | "months" | "years";
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

const SCHEDULE_COLUMNS = `
  id, species_id, vaccine_name, interval_value, interval_unit, description, sort_order, is_active,
  species:species_id (name)
`;

type Related = { name: string } | { name: string }[] | null;
function one(value: Related) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toSchedule(row: any): VaccinationSchedule {
  const species = one(row.species);

  return {
    id: row.id,
    speciesId: row.species_id,
    speciesName: species?.name ?? null,
    vaccineName: row.vaccine_name,
    intervalValue: row.interval_value,
    intervalUnit: row.interval_unit,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

/** Active schedules only — what a doctor picks from when recording a vaccination. */
export async function listActiveSchedules(): Promise<Result<VaccinationSchedule[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vaccination_schedules")
    .select(SCHEDULE_COLUMNS)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[vaccination-schedules] active list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSchedule) };
}

/** Every schedule, active or not — the admin management screen. */
export async function listAllSchedules(): Promise<Result<VaccinationSchedule[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vaccination_schedules")
    .select(SCHEDULE_COLUMNS)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[vaccination-schedules] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSchedule) };
}

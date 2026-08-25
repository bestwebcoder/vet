import { formatAge } from "@/lib/age";
import { createClient } from "@/lib/supabase/server";
import { formatWeight } from "@/lib/units";

/**
 * Patient reads.
 *
 * Every query runs under the caller's own policies, so scoping is not repeated
 * here: a client's query simply returns their pets, a doctor's returns their
 * organisation's. Derived values (age, kilograms) are computed on the way out
 * so no screen does its own arithmetic.
 */

/**
 * Breed is embedded by table name rather than by column. breed_id is half of a
 * composite foreign key onto breeds (id, species_id), which PostgREST does not
 * expose as a `breed_id` relationship — and that constraint is what stops a
 * Persian being recorded as a dog, so it stays. This string is sent verbatim
 * to PostgREST and cannot carry comments of its own.
 */
const PET_COLUMNS = `
  id, name, sex, is_neutered, date_of_birth, is_date_of_birth_estimated,
  weight_grams, weight_recorded_at, colour, microchip_number,
  allergies, chronic_conditions, notes, photo_path, client_id, organization_id, deleted_at,
  species:species_id (id, name),
  breed:breeds (id, name)
`;

type Related = { id: string; name: string } | { id: string; name: string }[] | null;

function one(value: Related) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type PetSummary = {
  id: string;
  name: string;
  speciesName: string | null;
  breedName: string | null;
  sex: string;
  age: string;
  weight: string | null;
  photoPath: string | null;
  isActive: boolean;
};

export type PetDetail = PetSummary & {
  clientId: string;
  organizationId: string;
  speciesId: string | null;
  breedId: string | null;
  isNeutered: boolean | null;
  dateOfBirth: string | null;
  isDateOfBirthEstimated: boolean;
  weightGrams: number | null;
  weightRecordedAt: string | null;
  colour: string | null;
  microchipNumber: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  notes: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toDetail(row: any): PetDetail {
  const species = one(row.species);
  const breed = one(row.breed);

  return {
    id: row.id,
    name: row.name,
    speciesName: species?.name ?? null,
    breedName: breed?.name ?? null,
    speciesId: species?.id ?? null,
    breedId: breed?.id ?? null,
    sex: row.sex,
    age: formatAge(row.date_of_birth, { isEstimated: row.is_date_of_birth_estimated }),
    weight: formatWeight(row.weight_grams),
    photoPath: row.photo_path,
    isActive: row.deleted_at === null,
    clientId: row.client_id,
    organizationId: row.organization_id,
    isNeutered: row.is_neutered,
    dateOfBirth: row.date_of_birth,
    isDateOfBirthEstimated: row.is_date_of_birth_estimated,
    weightGrams: row.weight_grams,
    weightRecordedAt: row.weight_recorded_at,
    colour: row.colour,
    microchipNumber: row.microchip_number,
    allergies: row.allergies,
    chronicConditions: row.chronic_conditions,
    notes: row.notes,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

/** Patients the caller may see, newest first. Optionally for one owner. */
export async function listPets(
  options: { clientId?: string; search?: string; limit?: number; includeInactive?: boolean } = {},
): Promise<Result<PetDetail[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("pets")
    .select(PET_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (!options.includeInactive) {
    query = query.is("deleted_at", null);
  }

  if (options.clientId) {
    query = query.eq("client_id", options.clientId);
  }

  const search = options.search?.trim();

  if (search) {
    // Clinic staff look a patient up by the owner as often as by the animal,
    // so owners are resolved first and their patients included.
    const escaped = search.replace(/[%,()]/g, " ");
    const digits = search.replace(/[\s()-]/g, "");
    const normalised = digits.replace(/^(?:\+?880|0)/, "+880");

    const { data: owners } = await supabase
      .from("clients")
      .select("id")
      .is("deleted_at", null)
      .or(
        [
          `full_name.ilike.%${escaped}%`,
          `phone.ilike.%${escaped}%`,
          ...(/^\+?\d+$/.test(digits) ? [`phone.ilike.%${normalised}%`] : []),
        ].join(","),
      );

    const ownerIds = (owners ?? []).map((owner) => owner.id);

    query = query.or(
      [
        `name.ilike.%${escaped}%`,
        `microchip_number.ilike.%${escaped}%`,
        ...(ownerIds.length ? [`client_id.in.(${ownerIds.join(",")})`] : []),
      ].join(","),
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[pets] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

export async function getPet(
  petId: string,
  options: { includeInactive?: boolean } = {},
): Promise<Result<PetDetail | null>> {
  const supabase = await createClient();

  let query = supabase.from("pets").select(PET_COLUMNS).eq("id", petId);
  if (!options.includeInactive) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[pets] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toDetail(data) : null };
}

export type Option = { id: string; name: string };

/** Species and breeds come from the database; nothing is hard-coded. */
export async function listSpecies(): Promise<Option[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("species")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    console.error("[pets] species list failed", error);
    return [];
  }

  return data ?? [];
}

export async function listBreeds(speciesId?: string): Promise<(Option & { speciesId: string })[]> {
  const supabase = await createClient();

  let query = supabase
    .from("breeds")
    .select("id, name, species_id")
    .eq("is_active", true)
    .order("name");

  if (speciesId) query = query.eq("species_id", speciesId);

  const { data, error } = await query;

  if (error) {
    console.error("[pets] breed list failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({ id: row.id, name: row.name, speciesId: row.species_id }));
}

/**
 * A short-lived link to a stored image. The buckets are private, so nothing is
 * ever addressable without one.
 */
export async function signedPhotoUrl(path: string | null, seconds = 600): Promise<string | null> {
  if (!path) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("pet-photos").createSignedUrl(path, seconds);

  if (error) {
    console.error("[pets] signing photo url failed", error);
    return null;
  }

  return data.signedUrl;
}

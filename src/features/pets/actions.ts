"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { failure, invalid, text, triState, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { petSchema, petToRow } from "@/lib/validation/pet";
import { describePhotoProblem, readPhoto, uploadPetPhoto } from "@/features/pets/photo";

/**
 * Patient writes.
 *
 * These actions resolve who the record belongs to and hand the rest to the
 * shared schema. They are not the access boundary: row level security decides
 * whether the write is allowed, and will refuse one these checks let through.
 */

function readPetForm(formData: FormData) {
  return {
    name: text(formData, "name") ?? "",
    speciesId: text(formData, "speciesId") ?? "",
    breedId: text(formData, "breedId") ?? null,
    sex: text(formData, "sex") ?? "unknown",
    isNeutered: triState(formData, "isNeutered"),
    dateOfBirth: text(formData, "dateOfBirth") ?? "",
    isDateOfBirthEstimated: formData.get("isDateOfBirthEstimated") === "on",
    weightKg: text(formData, "weightKg") ?? "",
    colour: text(formData, "colour") ?? "",
    microchipNumber: text(formData, "microchipNumber") ?? null,
    allergies: text(formData, "allergies") ?? "",
    chronicConditions: text(formData, "chronicConditions") ?? "",
    notes: text(formData, "notes") ?? "",
  };
}

/**
 * A client adding a pet does not say whose it is — it is theirs. Clinic staff
 * name the owner explicitly.
 */
async function resolveOwner(formData: FormData): Promise<
  { ok: true; clientId: string; organizationId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const requested = text(formData, "clientId");

  if (requested) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, organization_id")
      .eq("id", requested)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: "That client record could not be found." };
    }

    return { ok: true, clientId: data.id, organizationId: data.organization_id };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };

  const { data, error } = await supabase
    .from("clients")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      message: "Your client record is not set up yet. Contact your clinic to add a pet.",
    };
  }

  return { ok: true, clientId: data.id, organizationId: data.organization_id };
}

export async function createPetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = petSchema.safeParse(readPetForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const owner = await resolveOwner(formData);
  if (!owner.ok) return { status: "error", message: owner.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pets")
    .insert({
      ...petToRow(parsed.data),
      client_id: owner.clientId,
      organization_id: owner.organizationId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "That microchip number is already recorded against another patient.",
        fieldErrors: { microchipNumber: ["Already in use"] },
      };
    }

    return failure("pets", error, "We could not save this pet just now. Please try again.");
  }

  const photoMessage = await attachPhoto(data.id, formData);

  revalidatePath("/client");
  revalidatePath("/client/pets");

  return {
    status: "success",
    message: photoMessage
      ? `${parsed.data.name} has been added, but the photo could not be saved. ${photoMessage}`
      : `${parsed.data.name} has been added.`,
    id: data.id,
  };
}

/**
 * Saves a photo if one was chosen. Returns a sentence when it could not be
 * saved: a rejected image must not discard the record the person just typed.
 */
async function attachPhoto(petId: string, formData: FormData): Promise<string | null> {
  const file = readPhoto(formData);
  if (!file) return null;

  const problem = describePhotoProblem(file);
  if (problem) return problem;

  const uploaded = await uploadPetPhoto(petId, file);
  if (!uploaded.ok) return "Please try uploading it again.";

  const supabase = await createClient();
  const { error } = await supabase
    .from("pets")
    .update({ photo_path: uploaded.path })
    .eq("id", petId);

  if (error) {
    console.error("[pets] recording photo path failed", error);
    return "Please try uploading it again.";
  }

  return null;
}

export async function updatePetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const petId = text(formData, "petId");
  if (!petId) return { status: "error", message: "We could not tell which pet to update." };

  const parsed = petSchema.safeParse(readPetForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  // Only re-date the weight when the figure actually changed, so simply
  // editing a colour does not make a stale weight look freshly taken.
  const { data: existing } = await supabase
    .from("pets")
    .select("weight_grams, weight_recorded_at")
    .eq("id", petId)
    .maybeSingle();

  const row = petToRow(parsed.data);

  if (existing && existing.weight_grams === row.weight_grams && row.weight_grams !== null) {
    row.weight_recorded_at = existing.weight_recorded_at;
  }

  const { data, error } = await supabase
    .from("pets")
    .update(row)
    .eq("id", petId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "That microchip number is already recorded against another patient.",
        fieldErrors: { microchipNumber: ["Already in use"] },
      };
    }

    return failure("pets", error, "We could not save these changes just now. Please try again.");
  }

  // No row came back: the policies did not match this patient for this caller.
  if (!data) {
    return { status: "error", message: "You do not have access to this patient." };
  }

  const photoMessage = await attachPhoto(petId, formData);

  revalidatePath("/client");
  revalidatePath("/client/pets");
  revalidatePath(`/client/pets/${petId}`);

  return {
    status: "success",
    message: photoMessage ? `Changes saved, but the photo was not. ${photoMessage}` : "Changes saved.",
    id: petId,
  };
}

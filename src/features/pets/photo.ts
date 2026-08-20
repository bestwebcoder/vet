import { createClient } from "@/lib/supabase/server";

/**
 * Pet photographs.
 *
 * Stored at a path derived from the patient id and overwritten in place, so
 * replacing a photo never leaves an orphaned object behind. The bucket is
 * private; every read goes through a short-lived signed URL.
 */

export const PET_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The single object each patient's photo occupies. */
export function petPhotoPath(petId: string) {
  return `${petId}/photo`;
}

export function readPhoto(formData: FormData): File | null {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

/** Returns a sentence to show the user, or null when the file is acceptable. */
export function describePhotoProblem(file: File): string | null {
  if (!PET_PHOTO_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return "That image is larger than 5 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadPetPhoto(
  petId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = petPhotoPath(petId);

  const { error } = await supabase.storage
    .from("pet-photos")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[pets] photo upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

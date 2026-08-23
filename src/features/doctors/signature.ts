import { createClient } from "@/lib/supabase/server";

/**
 * A doctor's signature image, for the prescription PDF.
 *
 * Stored at a path derived from the doctor id and overwritten in place, same
 * shape as `src/features/pets/photo.ts`. This is deliberately the smallest
 * useful slice of doctor-profile management — a full profile screen stays
 * Phase 10's job; a doctor needs only this to finalize a prescription.
 */

export const SIGNATURE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export function doctorSignaturePath(doctorId: string) {
  return `${doctorId}/signature`;
}

export function readSignature(formData: FormData): File | null {
  const file = formData.get("signature");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export function describeSignatureProblem(file: File): string | null {
  if (!SIGNATURE_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_SIGNATURE_BYTES) {
    return "That image is larger than 2 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadDoctorSignature(
  doctorId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = doctorSignaturePath(doctorId);

  const { error } = await supabase.storage
    .from("doctor-signatures")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[doctors] signature upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

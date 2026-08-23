import { createClient } from "@/lib/supabase/server";

/**
 * A doctor's profile photo, admin-uploaded — same shape as
 * src/features/organizations/hero-image.ts (public bucket, overwritten in
 * place), since this photo is meant to show on the public Doctors page,
 * not just inside the authenticated app.
 */

export const DOCTOR_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_DOCTOR_PHOTO_BYTES = 5 * 1024 * 1024;

export function doctorPhotoPath(doctorId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${doctorId}/photo.${extension}`;
}

export function readDoctorPhoto(formData: FormData): File | null {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export function describeDoctorPhotoProblem(file: File): string | null {
  if (!DOCTOR_PHOTO_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_DOCTOR_PHOTO_BYTES) {
    return "That image is larger than 5 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadDoctorPhoto(
  doctorId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = doctorPhotoPath(doctorId, file.type);

  const { error } = await supabase.storage
    .from("doctor-photos")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[doctors] photo upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

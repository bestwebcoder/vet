import { createClient } from "@/lib/supabase/server";

/**
 * The optional picture on one page-section card. Same site-images bucket as
 * the logo, hero slides and page block images.
 *
 * Path carries a fresh uuid per upload rather than a fixed per-item name, so
 * replacing a picture writes a new object and the public URL changes with it
 * — no cache-busting query param needed, and no window where a CDN still
 * serves the previous picture. The superseded object is removed on the way
 * past (best effort: the row is the source of truth).
 */

export const SECTION_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_SECTION_IMAGE_BYTES = 5 * 1024 * 1024;

export function sectionImagePath(organizationId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${organizationId}/sections/${crypto.randomUUID()}.${extension}`;
}

export function readSectionImage(formData: FormData): File | null {
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export function describeSectionImageProblem(file: File): string | null {
  if (!SECTION_IMAGE_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_SECTION_IMAGE_BYTES) {
    return "That image is larger than 5 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadSectionImage(
  organizationId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = sectionImagePath(organizationId, file.type);

  const { error } = await supabase.storage.from("site-images").upload(path, file, { contentType: file.type });

  if (error) {
    console.error("[page-sections] section image upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

/** Best effort — a stray object left in the bucket is wasted space, not a correctness problem. */
export async function removeSectionImageObject(path: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from("site-images").remove([path]);

  if (error) {
    console.error("[page-sections] section image removal failed", error);
  }
}

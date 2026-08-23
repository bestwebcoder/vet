import { createClient } from "@/lib/supabase/server";

/**
 * The front page's hero image, admin-uploaded. Same shape as
 * src/features/doctors/signature.ts — stored at a path derived from the
 * organization id and overwritten in place — but in the site-images
 * bucket, the one PUBLIC bucket in this schema (see
 * 20260831000100_public_site.sql for why).
 */

export const HERO_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_HERO_IMAGE_BYTES = 5 * 1024 * 1024;

export function heroImagePath(organizationId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${organizationId}/hero.${extension}`;
}

export function readHeroImage(formData: FormData): File | null {
  const file = formData.get("heroImage");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export function describeHeroImageProblem(file: File): string | null {
  if (!HERO_IMAGE_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_HERO_IMAGE_BYTES) {
    return "That image is larger than 5 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadHeroImage(
  organizationId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = heroImagePath(organizationId, file.type);

  const { error } = await supabase.storage
    .from("site-images")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[organizations] hero image upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

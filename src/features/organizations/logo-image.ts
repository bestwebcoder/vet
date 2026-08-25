import { createClient } from "@/lib/supabase/server";

/**
 * The practice logo shown in the site header — every public page, not just
 * the Home page's hero. Same shape as src/features/organizations/hero-image.ts
 * (same site-images bucket, overwritten in place), a `logo` filename instead
 * of `hero` the only difference.
 */

export const LOGO_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_LOGO_IMAGE_BYTES = 2 * 1024 * 1024;

export function logoImagePath(organizationId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${organizationId}/logo.${extension}`;
}

export function readLogoImage(formData: FormData): File | null {
  const file = formData.get("logoImage");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export function describeLogoImageProblem(file: File): string | null {
  if (!LOGO_IMAGE_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_LOGO_IMAGE_BYTES) {
    return "That image is larger than 2 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadLogoImage(
  organizationId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = logoImagePath(organizationId, file.type);

  const { error } = await supabase.storage
    .from("site-images")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[organizations] logo image upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

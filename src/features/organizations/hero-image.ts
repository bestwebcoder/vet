import { createClient } from "@/lib/supabase/server";

export { MAX_HERO_IMAGES, MAX_HERO_CAPTION_LENGTH } from "@/features/organizations/hero-image-constants";

/**
 * The front page hero carousel's slides — an ordered gallery an admin
 * builds up, one upload at a time (see organization_hero_images,
 * 20260911000100_hero_gallery.sql). Same site-images bucket as the logo,
 * but a per-image path instead of one fixed, overwritten filename.
 */

export const HERO_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_HERO_IMAGE_BYTES = 5 * 1024 * 1024;

export function heroImagePath(organizationId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${organizationId}/hero/${crypto.randomUUID()}.${extension}`;
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

  const { error } = await supabase.storage.from("site-images").upload(path, file, { contentType: file.type });

  if (error) {
    console.error("[organizations] hero image upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

/** Best-effort — the DB row is the source of truth, so a stray object left behind here is not a correctness problem. */
export async function removeHeroImageObject(path: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from("site-images").remove([path]);

  if (error) {
    console.error("[organizations] hero image removal failed", error);
  }
}

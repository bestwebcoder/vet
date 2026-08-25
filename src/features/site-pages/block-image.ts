import { createClient } from "@/lib/supabase/server";

/**
 * An image block's picture — same site-images bucket as the hero image and
 * logo (src/features/organizations/hero-image.ts, logo-image.ts), a
 * per-block path instead of one fixed filename since a page can have any
 * number of image blocks.
 */

export const BLOCK_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_BLOCK_IMAGE_BYTES = 5 * 1024 * 1024;

export function blockImagePath(organizationId: string, blockId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${organizationId}/pages/${blockId}.${extension}`;
}

export function readBlockImage(formData: FormData): File | null {
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export function describeBlockImageProblem(file: File): string | null {
  if (!BLOCK_IMAGE_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_BLOCK_IMAGE_BYTES) {
    return "That image is larger than 5 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadBlockImage(
  organizationId: string,
  blockId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = blockImagePath(organizationId, blockId, file.type);

  const { error } = await supabase.storage
    .from("site-images")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[site-pages] block image upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

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

/**
 * A cards block's per-card picture. Unlike the image block above — one fixed
 * path per block, upsert-overwritten — a card's picture gets a fresh uuid per
 * upload, so replacing one changes the public URL and no CDN can keep serving
 * the previous picture. The superseded object is removed by the caller.
 */
export function cardImagePath(organizationId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${organizationId}/pages/cards/${crypto.randomUUID()}.${extension}`;
}

export async function uploadCardImage(
  organizationId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = cardImagePath(organizationId, file.type);

  const { error } = await supabase.storage.from("site-images").upload(path, file, { contentType: file.type });

  if (error) {
    console.error("[site-pages] card image upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

/** Best effort — the block's jsonb is the source of truth, so a stray object is wasted space, not a correctness problem. */
export async function removeBlockImageObject(path: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from("site-images").remove([path]);

  if (error) {
    console.error("[site-pages] block image removal failed", error);
  }
}

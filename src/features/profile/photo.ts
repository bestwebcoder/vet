import { createClient } from "@/lib/supabase/server";

/**
 * A person's account photo — self-uploaded, or set by an admin on their
 * behalf. Same shape as src/features/doctors/photo.ts (public bucket,
 * overwritten in place), but object-owner-scoped rather than admin-only:
 * see supabase/migrations/20260910000100_avatars.sql.
 */

export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function avatarPath(userId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${userId}/avatar.${extension}`;
}

export function readAvatar(formData: FormData): File | null {
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export function describeAvatarProblem(file: File): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return "That image is larger than 5 MB. Choose a smaller one.";
  }

  return null;
}

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false }> {
  const supabase = await createClient();
  const path = avatarPath(userId, file.type);

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[profile] avatar upload failed", error);
    return { ok: false };
  }

  return { ok: true, path };
}

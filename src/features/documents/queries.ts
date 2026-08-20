import { createClient } from "@/lib/supabase/server";

/**
 * Document reads. Policies decide what comes back: a client sees only what has
 * been shared with them, clinic staff see everything for their patients.
 */

export type PetDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  isClientVisible: boolean;
  uploadedAt: string;
  uploadedByName: string | null;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export async function listDocuments(petId: string): Promise<Result<PetDocument[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, file_name, storage_path, mime_type, size_bytes, description, is_client_visible, created_at, uploader:uploaded_by (full_name)",
    )
    .eq("pet_id", petId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[documents] list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => {
      const uploader = Array.isArray(row.uploader) ? row.uploader[0] : row.uploader;

      return {
        id: row.id,
        fileName: row.file_name,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        description: row.description,
        isClientVisible: row.is_client_visible,
        uploadedAt: row.created_at,
        uploadedByName: uploader?.full_name ?? null,
      };
    }),
  };
}

/**
 * A short-lived link to a stored file. The bucket is private, so this is the
 * only way to read one, and the link expires rather than being shareable
 * indefinitely.
 */
export async function signedDocumentUrl(path: string, seconds = 300): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from("pet-documents")
    .createSignedUrl(path, seconds);

  if (error) {
    console.error("[documents] signing url failed", error);
    return null;
  }

  return data.signedUrl;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

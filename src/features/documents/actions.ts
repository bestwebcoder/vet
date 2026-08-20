"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * Document uploads.
 *
 * The file is stored first, then recorded. If recording fails the object is
 * removed again, so the bucket never accumulates files no record describes.
 */

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 20 * 1024 * 1024;

/** Keeps the original name readable while making it safe as a path segment. */
function safeSegment(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
}

export async function uploadDocumentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const petId = text(formData, "petId");
  if (!petId) return { status: "error", message: "We could not tell which pet this belongs to." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      status: "error",
      message: "Choose a file to upload.",
      fieldErrors: { file: ["Required"] },
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      status: "error",
      message: "Upload a JPEG, PNG, WebP or PDF.",
      fieldErrors: { file: ["Unsupported file type"] },
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      status: "error",
      message: "That file is larger than 20 MB. Please upload a smaller one.",
      fieldErrors: { file: ["Too large"] },
    };
  }

  const user = await getSessionUser();
  if (!user) return { status: "error", message: "Please sign in again." };

  const supabase = await createClient();

  // The organisation comes from the patient, never from the form.
  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, organization_id")
    .eq("id", petId)
    .is("deleted_at", null)
    .maybeSingle();

  if (petError || !pet) {
    return { status: "error", message: "You do not have access to this patient." };
  }

  const path = `${petId}/${crypto.randomUUID()}-${safeSegment(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("pet-documents")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return failure("documents", uploadError, "We could not upload that file. Please try again.");
  }

  // A client's own upload is always visible to them; the insert policy
  // requires it, and hiding someone's own file from them makes no sense.
  const isClientVisible = !user.roles.some((role) => role === "doctor" || role === "admin");

  const { error: insertError } = await supabase.from("documents").insert({
    pet_id: petId,
    organization_id: pet.organization_id,
    file_name: file.name,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    description: text(formData, "description") ?? null,
    is_client_visible: isClientVisible,
    uploaded_by: user.id,
  });

  if (insertError) {
    // Leave nothing behind that no record accounts for.
    await supabase.storage.from("pet-documents").remove([path]);
    return failure("documents", insertError, "We could not save that file. Please try again.");
  }

  revalidatePath(`/client/pets/${petId}/documents`);

  return { status: "success", message: `${file.name} has been uploaded.` };
}

/** Withdraws a document. Soft delete only: nothing is destroyed. */
export async function removeDocumentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const documentId = text(formData, "documentId");
  const petId = text(formData, "petId");

  if (!documentId || !petId) {
    return { status: "error", message: "We could not tell which document to remove." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("documents", error, "We could not remove that file. Please try again.");
  }

  if (!data) {
    return { status: "error", message: "You can only remove a file you uploaded yourself." };
  }

  revalidatePath(`/client/pets/${petId}/documents`);

  return { status: "success", message: "The file has been removed." };
}

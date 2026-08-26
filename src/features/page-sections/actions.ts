"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import {
  describeSectionImageProblem,
  readSectionImage,
  removeSectionImageObject,
  uploadSectionImage,
} from "@/features/page-sections/section-image";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { pageDefinition, sectionDefinition } from "@/lib/page-sections";
import { createClient } from "@/lib/supabase/server";
import { pageSectionItemSchema } from "@/lib/validation/page-sections";

/** The admin editor and the public page it feeds — both go stale on every write here. */
function revalidateFor(page: string) {
  revalidatePath("/admin/website");
  revalidatePath(`/admin/website/sections/${page}`);

  const href = pageDefinition(page)?.href;
  if (href) revalidatePath(href);
}

function readPageSectionItem(formData: FormData) {
  const page = text(formData, "page") ?? "";
  const section = text(formData, "section") ?? "";
  const icon = text(formData, "icon");

  return {
    page,
    section,
    // A numbered section has no icon field on screen, so anything posted for
    // it is stale form state, not a choice — drop it rather than store a value
    // nothing renders.
    icon: sectionDefinition(page, section)?.usesIcon === false ? null : (icon ?? null),
    title: text(formData, "title") ?? "",
    description: text(formData, "description") ?? "",
  };
}

function imageProblem(file: File): FormState {
  return {
    status: "error",
    message: "Please correct the highlighted fields.",
    fieldErrors: { image: [describeSectionImageProblem(file)!] },
  };
}

/** Appends to whatever is already in that section — reorder happens separately, via drag. */
export async function createPageSectionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = pageSectionItemSchema.safeParse(readPageSectionItem(formData));
  if (!parsed.success) return invalid(parsed.error);

  const file = readSectionImage(formData);
  if (file && describeSectionImageProblem(file)) return imageProblem(file);

  // Uploaded before the insert so a storage failure costs nothing; if the
  // insert then fails, the orphan is cleaned up below.
  let imagePath: string | null = null;
  if (file) {
    const upload = await uploadSectionImage(organizationId, file);
    if (!upload.ok) return { status: "error", message: "We could not upload that image just now. Please try again." };
    imagePath = upload.path;
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("page_section_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("page", parsed.data.page)
    .eq("section", parsed.data.section);

  const { error } = await supabase.from("page_section_items").insert({
    organization_id: organizationId,
    page: parsed.data.page,
    section: parsed.data.section,
    icon: parsed.data.icon,
    image_path: imagePath,
    title: parsed.data.title,
    description: parsed.data.description,
    position: count ?? 0,
  });

  if (error) {
    if (imagePath) await removeSectionImageObject(imagePath);
    return failure("page-sections", error, "We could not add that item just now. Please try again.");
  }

  revalidateFor(parsed.data.page);
  return { status: "success", message: "Item added." };
}

export async function updatePageSectionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const itemId = text(formData, "itemId");
  if (!itemId) return { status: "error", message: "We could not tell which item this is." };

  const parsed = pageSectionItemSchema.safeParse(readPageSectionItem(formData));
  if (!parsed.success) return invalid(parsed.error);

  const file = readSectionImage(formData);
  if (file && describeSectionImageProblem(file)) return imageProblem(file);

  const removeImage = formData.get("removeImage") === "on";
  const supabase = await createClient();

  // Read the current path first: whichever way this goes, the object it points
  // at is about to be superseded and needs removing afterward.
  const { data: existing } = await supabase
    .from("page_section_items")
    .select("image_path")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const previousPath: string | null = existing?.image_path ?? null;

  let imagePath: string | null | undefined;
  if (file) {
    const upload = await uploadSectionImage(organizationId, file);
    if (!upload.ok) return { status: "error", message: "We could not upload that image just now. Please try again." };
    imagePath = upload.path;
  } else if (removeImage) {
    imagePath = null;
  }

  const { error } = await supabase
    .from("page_section_items")
    .update({
      icon: parsed.data.icon,
      title: parsed.data.title,
      description: parsed.data.description,
      // Left out entirely when neither a new file nor a removal was posted, so
      // saving the text alone never disturbs the picture.
      ...(imagePath === undefined ? {} : { image_path: imagePath }),
    })
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (error) {
    if (typeof imagePath === "string") await removeSectionImageObject(imagePath);
    return failure("page-sections", error, "We could not save that item just now. Please try again.");
  }

  if (imagePath !== undefined && previousPath) await removeSectionImageObject(previousPath);

  revalidateFor(parsed.data.page);
  return { status: "success", message: "Item saved." };
}

export async function deletePageSectionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const itemId = text(formData, "itemId");
  const page = text(formData, "page") ?? "";
  if (!itemId) return { status: "error", message: "We could not tell which item to remove." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("page_section_items")
    .select("image_path")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const { error } = await supabase.from("page_section_items").delete().eq("id", itemId).eq("organization_id", organizationId);

  if (error) {
    return failure("page-sections", error, "We could not remove that item just now. Please try again.");
  }

  if (existing?.image_path) await removeSectionImageObject(existing.image_path);

  revalidateFor(page);
  return { status: "success", message: "Item removed." };
}

/** A drag settles as a full new order within one section — it never crosses sections or pages, so a plain position rewrite is enough. */
export async function reorderPageSectionItemsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const page = text(formData, "page");
  const section = text(formData, "section");
  const raw = text(formData, "order");
  if (!page || !section || !raw) return { status: "error", message: "We could not tell the new order." };

  let orderedIds: unknown;
  try {
    orderedIds = JSON.parse(raw);
  } catch {
    return { status: "error", message: "We could not read the new order. Please try again." };
  }

  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === "string")) {
    return { status: "error", message: "We could not read the new order. Please try again." };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase
        .from("page_section_items")
        .update({ position })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("page", page)
        .eq("section", section),
    ),
  );

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    return failure("page-sections", firstError, "We could not save that order just now. Please try again.");
  }

  revalidateFor(page);
  return { status: "success" };
}

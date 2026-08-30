"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { serviceCategorySchema, serviceCategoryToRow } from "@/lib/validation/service-category";

/**
 * Service category writes — admin only, enforced by row level security.
 * Same shape as `src/features/vaccination-schedules/actions.ts`.
 */

/**
 * Every screen that shows the catalogue: the admin list, the website editors
 * that let a page's blocks be reworded and reordered, and the public pages
 * those blocks render on. One function because the list had been copied to
 * five call sites and had already drifted — a deactivate refreshed the admin
 * list and left the public page showing the service.
 */
function revalidateCatalogue() {
  for (const path of [
    "/admin/services",
    "/admin/website/sections/services",
    "/admin/website/sections/training",
    "/services",
    "/training-education",
  ]) {
    revalidatePath(path);
  }
}

export async function createCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceCategorySchema.safeParse({
    name: text(formData, "name") ?? "",
    description: text(formData, "description") ?? "",
    icon: text(formData, "icon") ?? null,
  });
  if (!parsed.success) return invalid(parsed.error);

  const user = await getSessionUser();
  const organizationId = user?.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Please sign in again." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_categories")
    .insert({ ...serviceCategoryToRow(parsed.data), organization_id: organizationId });

  if (error) {
    return failure("service_categories", error, "We could not save that category just now. Please try again.");
  }

  revalidateCatalogue();
  return { status: "success", message: "Category added." };
}

/**
 * Renames a category and edits how its section reads on the public page.
 *
 * Categories could only be created and retired before this: the name was the
 * whole of a category, so there was nothing to change that deleting and
 * re-adding would not also do. A description and an icon are worth editing —
 * they are public copy, and re-creating the category would orphan every
 * service filed under it.
 */
export async function updateCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const categoryId = text(formData, "categoryId");
  if (!categoryId) return { status: "error", message: "We could not tell which category to update." };

  const parsed = serviceCategorySchema.safeParse({
    name: text(formData, "name") ?? "",
    description: text(formData, "description") ?? "",
    icon: text(formData, "icon") ?? null,
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_categories")
    .update(serviceCategoryToRow(parsed.data))
    .eq("id", categoryId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "A category with this name already exists." };
    }
    return failure("service_categories", error, "We could not save that category just now. Please try again.");
  }

  if (!data) return { status: "error", message: "You do not have access to this category." };

  revalidateCatalogue();
  return { status: "success", message: "Category saved." };
}

export async function toggleCategoryActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const categoryId = text(formData, "categoryId");
  const isActive = text(formData, "isActive") === "true";
  if (!categoryId) return { status: "error", message: "We could not tell which category to update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_categories")
    .update({ is_active: !isActive })
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("service_categories", error, "We could not update that category just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this category." };

  revalidateCatalogue();
  return { status: "success", message: isActive ? "Category deactivated." : "Category reactivated." };
}

/**
 * Removes a category. Services that used it fall back to "No category" rather
 * than disappearing — services.category_id is ON DELETE SET NULL — so nothing
 * bookable is lost by tidying the list up.
 */
export async function deleteCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const categoryId = text(formData, "categoryId");
  if (!categoryId) return { status: "error", message: "We could not tell which category to delete." };

  const supabase = await createClient();
  const { error } = await supabase.from("service_categories").delete().eq("id", categoryId);

  if (error) {
    return failure("service-categories", error, "We could not delete that category just now. Please try again.");
  }

  revalidateCatalogue();
  return { status: "success", message: "Category deleted." };
}

/**
 * The order the category sections read in on the public pages.
 *
 * Same shape as reorderServicesAction, and for the same reason: one narrow
 * update per row, touching sort_order and nothing else.
 */
export async function reorderCategoriesAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const raw = text(formData, "order");
  if (!raw) return { status: "error", message: "We could not tell the new order." };

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
    orderedIds.map((id, index) => supabase.from("service_categories").update({ sort_order: index }).eq("id", id)),
  );

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    return failure("service_categories", firstError, "We could not save that order just now. Please try again.");
  }

  revalidateCatalogue();
  return { status: "success" };
}

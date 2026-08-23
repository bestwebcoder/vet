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

export async function createCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceCategorySchema.safeParse({ name: text(formData, "name") ?? "" });
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

  revalidatePath("/admin/services");
  return { status: "success", message: "Category added." };
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

  revalidatePath("/admin/services");
  return { status: "success", message: isActive ? "Category deactivated." : "Category reactivated." };
}

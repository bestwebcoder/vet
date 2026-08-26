"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { homeSectionItemSchema } from "@/lib/validation/home-sections";

function readHomeSectionItem(formData: FormData) {
  const section = text(formData, "section");
  const icon = text(formData, "icon");
  return {
    section,
    icon: section === "how_it_works" ? null : (icon ?? null),
    title: text(formData, "title") ?? "",
    description: text(formData, "description") ?? "",
  };
}

/** Appends to whatever's already in that section — reorder happens separately, via drag. */
export async function createHomeSectionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = homeSectionItemSchema.safeParse(readHomeSectionItem(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  const { count } = await supabase
    .from("home_section_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("section", parsed.data.section);

  const { error } = await supabase.from("home_section_items").insert({
    organization_id: organizationId,
    section: parsed.data.section,
    icon: parsed.data.icon,
    title: parsed.data.title,
    description: parsed.data.description,
    position: count ?? 0,
  });

  if (error) {
    return failure("home-sections", error, "We could not add that item just now. Please try again.");
  }

  revalidatePath("/admin/website");
  revalidatePath("/");
  return { status: "success", message: "Item added." };
}

export async function updateHomeSectionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const itemId = text(formData, "itemId");
  if (!itemId) return { status: "error", message: "We could not tell which item this is." };

  const parsed = homeSectionItemSchema.safeParse(readHomeSectionItem(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("home_section_items")
    .update({
      icon: parsed.data.icon,
      title: parsed.data.title,
      description: parsed.data.description,
    })
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (error) {
    return failure("home-sections", error, "We could not save that item just now. Please try again.");
  }

  revalidatePath("/admin/website");
  revalidatePath("/");
  return { status: "success", message: "Item saved." };
}

export async function deleteHomeSectionItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const itemId = text(formData, "itemId");
  if (!itemId) return { status: "error", message: "We could not tell which item to remove." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("home_section_items")
    .delete()
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (error) {
    return failure("home-sections", error, "We could not remove that item just now. Please try again.");
  }

  revalidatePath("/admin/website");
  revalidatePath("/");
  return { status: "success", message: "Item removed." };
}

/** A drag settles as a full new order within one section — never crosses sections, so a plain position rewrite (no reparenting) is enough, unlike the nav tree's RPC. */
export async function reorderHomeSectionItemsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const section = text(formData, "section");
  const raw = text(formData, "order");
  if (!section || !raw) return { status: "error", message: "We could not tell the new order." };

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
      supabase.from("home_section_items").update({ position }).eq("id", id).eq("organization_id", organizationId).eq("section", section),
    ),
  );

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    return failure("home-sections", firstError, "We could not save that order just now. Please try again.");
  }

  revalidatePath("/admin/website");
  revalidatePath("/");
  return { status: "success" };
}

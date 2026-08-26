"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { navMenuItemSchema, navMenuTreeSchema } from "@/lib/validation/nav-menu";

/** Every public route the header/footer/mobile nav appear on — mirrors updateLogoImageAction's own list for the same reason. */
function revalidatePublicRoutes() {
  for (const path of ["/", "/about", "/services", "/contact", "/doctors"]) {
    revalidatePath(path);
  }
  revalidatePath("/[slug]", "page");
  revalidatePath("/admin/website/navigation");
}

function readNavMenuItem(formData: FormData) {
  return {
    label: text(formData, "label") ?? "",
    href: text(formData, "href") ?? "",
    isVisible: text(formData, "isVisible") === "on",
    opensNewTab: text(formData, "opensNewTab") === "on",
  };
}

/** Adds a new top-level item, or a dropdown child when parentId is given — appended after whatever's already at that level. */
export async function createNavMenuItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = navMenuItemSchema.safeParse(readNavMenuItem(formData));
  if (!parsed.success) return invalid(parsed.error);

  const parentId = text(formData, "parentId") ?? null;

  const supabase = await createClient();

  let countQuery = supabase
    .from("nav_menu_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  countQuery = parentId ? countQuery.eq("parent_id", parentId) : countQuery.is("parent_id", null);
  const { count } = await countQuery;

  const { error } = await supabase.from("nav_menu_items").insert({
    organization_id: organizationId,
    parent_id: parentId,
    label: parsed.data.label,
    href: parsed.data.href,
    is_visible: parsed.data.isVisible,
    opens_new_tab: parsed.data.opensNewTab,
    position: count ?? 0,
  });

  if (error) {
    return failure("nav-menu", error, "We could not add that menu item just now. Please try again.");
  }

  revalidatePublicRoutes();
  return { status: "success", message: "Menu item added." };
}

export async function updateNavMenuItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const itemId = text(formData, "itemId");
  if (!itemId) return { status: "error", message: "We could not tell which menu item this is." };

  const parsed = navMenuItemSchema.safeParse(readNavMenuItem(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("nav_menu_items")
    .update({
      label: parsed.data.label,
      href: parsed.data.href,
      is_visible: parsed.data.isVisible,
      opens_new_tab: parsed.data.opensNewTab,
    })
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (error) {
    return failure("nav-menu", error, "We could not save that menu item just now. Please try again.");
  }

  revalidatePublicRoutes();
  return { status: "success", message: "Menu item saved." };
}

/** A top-level item's dropdown children cascade with it — the confirm dialog says so. */
export async function deleteNavMenuItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const itemId = text(formData, "itemId");
  if (!itemId) return { status: "error", message: "We could not tell which menu item to remove." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("nav_menu_items")
    .delete()
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (error) {
    return failure("nav-menu", error, "We could not remove that menu item just now. Please try again.");
  }

  revalidatePublicRoutes();
  return { status: "success", message: "Menu item removed." };
}

/**
 * One full-tree rewrite per drag settle, not a pairwise swap — see
 * reorder_nav_menu_items in 20260913000100_nav_menu_items.sql for why this
 * goes through an RPC rather than a sequence of .update() calls.
 */
export async function reorderNavMenuTreeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const raw = text(formData, "tree");
  if (!raw) return { status: "error", message: "We could not tell the new order." };

  let treeJson: unknown;
  try {
    treeJson = JSON.parse(raw);
  } catch {
    return { status: "error", message: "We could not read the new order. Please try again." };
  }

  const parsed = navMenuTreeSchema.safeParse(treeJson);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_nav_menu_items", {
    p_organization_id: organizationId,
    p_tree: parsed.data,
  });

  if (error) {
    return failure("nav-menu", error, "We could not save that order just now. Please try again.");
  }

  revalidatePublicRoutes();
  return { status: "success" };
}

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The site's navigation — header, mobile menu, and footer link list all
 * read from here (see nav_menu_items, 20260913000100_nav_menu_items.sql).
 * A two-level tree: top-level items, each optionally holding dropdown
 * children — enforced both by the admin UI and a DB trigger.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type NavMenuItem = {
  id: string;
  label: string;
  href: string;
  isVisible: boolean;
  opensNewTab: boolean;
};

export type NavMenuTreeItem = NavMenuItem & { children: NavMenuItem[] };

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select below */
function toItem(row: any): NavMenuItem {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    isVisible: row.is_visible,
    opensNewTab: row.opens_new_tab,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select below */
function assembleTree(rows: any[]): NavMenuTreeItem[] {
  const childrenByParent = new Map<string, any[]>();
  const topRows: any[] = [];

  for (const row of rows) {
    if (row.parent_id) {
      const siblings = childrenByParent.get(row.parent_id) ?? [];
      siblings.push(row);
      childrenByParent.set(row.parent_id, siblings);
    } else {
      topRows.push(row);
    }
  }

  return topRows.map((row) => ({
    ...toItem(row),
    children: (childrenByParent.get(row.id) ?? []).map(toItem),
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ITEM_COLUMNS = "id, parent_id, label, href, position, is_visible, opens_new_tab";

/** Every item, visible or not — the admin tree editor shows and toggles both. */
export async function listNavMenuTreeForAdmin(organizationId: string): Promise<Result<NavMenuTreeItem[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nav_menu_items")
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .order("position");

  if (error) {
    console.error("[nav-menu] admin list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: assembleTree(data ?? []) };
}

/**
 * For every public page's header/footer/mobile nav — reached before any
 * session exists, so it goes through the service role, same as
 * getPublicSitePage. Only visible items.
 */
export async function getPublicNavTree(organizationId: string): Promise<NavMenuTreeItem[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("nav_menu_items")
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("is_visible", true)
    .order("position");

  if (error) {
    console.error("[nav-menu] public tree failed", error);
    return [];
  }

  // A hidden top-level item's still-visible children would otherwise float
  // free with no parent to hang off — drop children whose parent isn't in
  // this visible set instead of promoting them to top-level.
  const visibleIds = new Set((data ?? []).map((row) => row.id));
  const rows = (data ?? []).filter((row) => !row.parent_id || visibleIds.has(row.parent_id));

  return assembleTree(rows);
}

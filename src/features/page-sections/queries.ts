import { publicEnv } from "@/lib/env";
import { PAGE_SECTIONS, pageDefinition, type PageKey } from "@/lib/page-sections";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The fixed marketing pages' card lists — see page_section_items,
 * 20260916000100_page_sections.sql. Independent, position-ordered lists
 * sharing one table, discriminated by (page, section).
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type PageSectionItem = {
  id: string;
  page: string;
  section: string;
  position: number;
  icon: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  title: string;
  description: string;
};

/** Section key → its items, in position order. Every section the page defines is present, possibly empty. */
export type PageSectionItems = Record<string, PageSectionItem[]>;

function sectionImagePublicUrl(path: string): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-images/${path}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select below */
function toItem(row: any): PageSectionItem {
  return {
    id: row.id,
    page: row.page,
    section: row.section,
    position: row.position,
    icon: row.icon,
    imagePath: row.image_path,
    imageUrl: row.image_path ? sectionImagePublicUrl(row.image_path) : null,
    title: row.title,
    description: row.description,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Starts every section the registry defines, so a caller can render without checking for undefined. */
function emptySections(page: string): PageSectionItems {
  const definition = pageDefinition(page);
  return Object.fromEntries((definition?.sections ?? []).map((section) => [section.key, [] as PageSectionItem[]]));
}

function grouped(page: string, items: PageSectionItem[]): PageSectionItems {
  const bySection = emptySections(page);
  // A row whose section is no longer in the registry is skipped rather than
  // shown in a tab that does not exist — it stays in the table, so removing a
  // section from the registry is reversible.
  for (const item of items) bySection[item.section]?.push(item);
  for (const key of Object.keys(bySection)) bySection[key].sort((a, b) => a.position - b.position);
  return bySection;
}

const ITEM_COLUMNS = "id, page, section, position, icon, image_path, title, description";

export async function listPageSectionItemsForAdmin(organizationId: string, page: PageKey): Promise<Result<PageSectionItems>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("page_section_items")
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("page", page)
    .order("position");

  if (error) {
    console.error("[page-sections] admin list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: grouped(page, (data ?? []).map(toItem)) };
}

/** How many items each page has, for the index cards on /admin/website. */
export async function countPageSectionItemsForAdmin(organizationId: string): Promise<Result<Record<string, number>>> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("page_section_items").select("page").eq("organization_id", organizationId);

  if (error) {
    console.error("[page-sections] admin count failed", error);
    return { status: "error" };
  }

  const counts = Object.fromEntries(PAGE_SECTIONS.map((definition) => [definition.key, 0]));
  for (const row of data ?? []) {
    if (row.page in counts) counts[row.page] += 1;
  }

  return { status: "ok", data: counts };
}

/** For the public pages — reached before any session exists, so it goes through the service role, same as getPublicSiteContent. */
export async function getPublicPageSectionItems(organizationId: string, page: PageKey): Promise<PageSectionItems> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("page_section_items")
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("page", page)
    .order("position");

  if (error) {
    console.error("[page-sections] public list failed", error);
    return emptySections(page);
  }

  return grouped(page, (data ?? []).map(toItem));
}

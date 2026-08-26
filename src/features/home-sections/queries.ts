import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { HOME_SECTIONS, type HomeSection } from "@/lib/validation/home-sections";

/**
 * The home page's "What we offer", "Why pet owners choose" and "How it
 * works" item lists — see home_section_items,
 * 20260914000100_home_section_items.sql. Three independent, position-
 * ordered lists sharing one table, discriminated by `section`.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type HomeSectionItem = {
  id: string;
  section: HomeSection;
  position: number;
  icon: string | null;
  title: string;
  description: string;
};

export type HomeSectionItemsBySection = Record<HomeSection, HomeSectionItem[]>;

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select below */
function toItem(row: any): HomeSectionItem {
  return {
    id: row.id,
    section: row.section,
    position: row.position,
    icon: row.icon,
    title: row.title,
    description: row.description,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function grouped(items: HomeSectionItem[]): HomeSectionItemsBySection {
  const bySection: HomeSectionItemsBySection = { services: [], why: [], how_it_works: [] };
  for (const item of items) bySection[item.section].push(item);
  for (const section of HOME_SECTIONS) bySection[section].sort((a, b) => a.position - b.position);
  return bySection;
}

const ITEM_COLUMNS = "id, section, position, icon, title, description";

export async function listHomeSectionItemsForAdmin(organizationId: string): Promise<Result<HomeSectionItemsBySection>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("home_section_items")
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .order("position");

  if (error) {
    console.error("[home-sections] admin list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: grouped((data ?? []).map(toItem)) };
}

/** For the public home page — reached before any session exists, so it goes through the service role, same as getPublicSiteContent. */
export async function getPublicHomeSectionItems(organizationId: string): Promise<HomeSectionItemsBySection> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("home_section_items")
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .order("position");

  if (error) {
    console.error("[home-sections] public list failed", error);
    return { services: [], why: [], how_it_works: [] };
  }

  return grouped((data ?? []).map(toItem));
}

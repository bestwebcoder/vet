import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { BlockType } from "@/lib/validation/site-pages";

/**
 * Admin-created public pages and the block editor behind them — see the
 * `site_pages` / `site_page_blocks` tables (20260908000100_site_pages.sql).
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type SitePageSummary = {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  blockCount: number;
};

export type TextBlockContent = { heading: string | null; body: string };
export type ImageBlockContent = { path: string | null; url: string | null; caption: string | null };
export type SectionBlockContent = { heading: string; body: string | null };
export type ColumnsBlockContent = { items: { heading: string | null; body: string | null }[] };

export type SitePageBlock =
  | { id: string; position: number; blockType: "text"; content: TextBlockContent }
  | { id: string; position: number; blockType: "image"; content: ImageBlockContent }
  | { id: string; position: number; blockType: "section"; content: SectionBlockContent }
  | { id: string; position: number; blockType: "columns"; content: ColumnsBlockContent };

export type SitePageDetail = SitePageSummary & { blocks: SitePageBlock[] };

function blockImagePublicUrl(path: string): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-images/${path}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- jsonb content, shaped by block_type and validated on write, not on read */
function toBlock(row: any): SitePageBlock {
  const content = row.content ?? {};

  switch (row.block_type as BlockType) {
    case "text":
      return { id: row.id, position: row.position, blockType: "text", content: { heading: content.heading ?? null, body: content.body ?? "" } };
    case "image":
      return {
        id: row.id,
        position: row.position,
        blockType: "image",
        content: {
          path: content.path ?? null,
          url: content.path ? blockImagePublicUrl(content.path) : null,
          caption: content.caption ?? null,
        },
      };
    case "section":
      return { id: row.id, position: row.position, blockType: "section", content: { heading: content.heading ?? "", body: content.body ?? null } };
    case "columns":
      return { id: row.id, position: row.position, blockType: "columns", content: { items: Array.isArray(content.items) ? content.items : [] } };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const PAGE_COLUMNS = "id, title, slug, is_published, site_page_blocks(count)";

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by PAGE_COLUMNS above */
function toSummary(row: any): SitePageSummary {
  const blockCount = Array.isArray(row.site_page_blocks) ? (row.site_page_blocks[0]?.count ?? 0) : 0;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    isPublished: row.is_published,
    blockCount,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listSitePagesForAdmin(organizationId: string): Promise<Result<SitePageSummary[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("site_pages")
    .select(PAGE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("title");

  if (error) {
    console.error("[site-pages] admin list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary) };
}

export async function getSitePageForAdmin(pageId: string): Promise<Result<SitePageDetail | null>> {
  const supabase = await createClient();

  const [{ data: page, error: pageError }, { data: blockRows, error: blockError }] = await Promise.all([
    supabase.from("site_pages").select(PAGE_COLUMNS).eq("id", pageId).maybeSingle(),
    supabase.from("site_page_blocks").select("id, position, block_type, content").eq("page_id", pageId).order("position"),
  ]);

  if (pageError || blockError) {
    console.error("[site-pages] admin get failed", pageError ?? blockError);
    return { status: "error" };
  }

  if (!page) return { status: "ok", data: null };

  return { status: "ok", data: { ...toSummary(page), blocks: (blockRows ?? []).map(toBlock) } };
}

export type PublicSitePage = { title: string; blocks: SitePageBlock[] };

/** For the public [slug] route — reached before any session exists, so it goes through the service role. */
export async function getPublicSitePage(organizationId: string, slug: string): Promise<PublicSitePage | null> {
  const supabase = createServiceClient();

  const { data: page, error: pageError } = await supabase
    .from("site_pages")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (pageError) {
    console.error("[site-pages] public get failed", pageError);
    return null;
  }
  if (!page) return null;

  const { data: blockRows, error: blockError } = await supabase
    .from("site_page_blocks")
    .select("id, position, block_type, content")
    .eq("page_id", page.id)
    .order("position");

  if (blockError) {
    console.error("[site-pages] public blocks failed", blockError);
    return null;
  }

  return { title: page.title, blocks: (blockRows ?? []).map(toBlock) };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { describeBlockImageProblem, readBlockImage, uploadBlockImage } from "@/features/site-pages/block-image";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  columnsBlockSchema,
  sectionBlockSchema,
  sitePageSettingsSchema,
  textBlockSchema,
  type BlockType,
} from "@/lib/validation/site-pages";

function duplicateSlug(): FormState {
  return {
    status: "error",
    message: "A page with this URL already exists.",
    fieldErrors: { slug: ["Already in use"] },
  };
}

function readSitePageSettings(formData: FormData) {
  return {
    title: text(formData, "title") ?? "",
    slug: text(formData, "slug") ?? "",
    showInNav: text(formData, "showInNav") === "on",
    isPublished: text(formData, "isPublished") === "on",
  };
}

/** Creates the page, then sends the admin straight to its block editor — an empty page is not useful on its own. */
export async function createSitePageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = sitePageSettingsSchema.safeParse(readSitePageSettings(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .insert({
      organization_id: organizationId,
      title: parsed.data.title,
      slug: parsed.data.slug,
      show_in_nav: parsed.data.showInNav,
      is_published: parsed.data.isPublished,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return duplicateSlug();
    return failure("site-pages", error, "We could not create that page just now. Please try again.");
  }

  revalidatePath("/admin/website");
  redirect(`/admin/website/pages/${data.id}`);
}

export async function updateSitePageSettingsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  if (!pageId) return { status: "error", message: "We could not tell which page this is." };

  const parsed = sitePageSettingsSchema.safeParse(readSitePageSettings(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_pages")
    .update({
      title: parsed.data.title,
      slug: parsed.data.slug,
      show_in_nav: parsed.data.showInNav,
      is_published: parsed.data.isPublished,
    })
    .eq("id", pageId);

  if (error) {
    if (error.code === "23505") return duplicateSlug();
    return failure("site-pages", error, "We could not save this page just now. Please try again.");
  }

  revalidatePath("/admin/website");
  revalidatePath(`/admin/website/pages/${pageId}`);
  revalidatePath(`/${parsed.data.slug}`);
  return { status: "success", message: "Page settings saved." };
}

/** A real delete, not a soft one — same tier as site_content (marketing copy, not clinical). */
export async function deleteSitePageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  if (!pageId) return { status: "error", message: "We could not tell which page to delete." };

  const supabase = await createClient();
  const { error } = await supabase.from("site_pages").delete().eq("id", pageId);

  if (error) {
    return failure("site-pages", error, "We could not delete this page just now. Please try again.");
  }

  revalidatePath("/admin/website");
  redirect("/admin/website");
}

/** Appends a block of the given type with sensible empty defaults, after whatever is already on the page. */
export async function addBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  const blockType = text(formData, "blockType") as BlockType | undefined;
  if (!pageId || !blockType) return { status: "error", message: "We could not tell what to add." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("site_page_blocks")
    .select("id", { count: "exact", head: true })
    .eq("page_id", pageId);

  const defaults: Record<BlockType, Record<string, unknown>> = {
    text: { body: "" },
    image: {},
    section: { heading: "" },
    columns: { items: [{ heading: "", body: "" }, { heading: "", body: "" }] },
  };

  const { error } = await supabase
    .from("site_page_blocks")
    .insert({ page_id: pageId, block_type: blockType, position: count ?? 0, content: defaults[blockType] });

  if (error) {
    return failure("site-pages", error, "We could not add that block just now. Please try again.");
  }

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success" };
}

export async function deleteBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return { status: "error", message: "We could not tell which block to remove." };

  const supabase = await createClient();
  const { error } = await supabase.from("site_page_blocks").delete().eq("id", blockId);

  if (error) {
    return failure("site-pages", error, "We could not remove that block just now. Please try again.");
  }

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success" };
}

/** Swaps this block's position with its neighbor in the given direction — the whole reordering UI, no drag-and-drop needed. */
export async function moveBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  const direction = text(formData, "direction");
  if (!pageId || !blockId || (direction !== "up" && direction !== "down")) {
    return { status: "error", message: "We could not tell what to move." };
  }

  const supabase = await createClient();
  const { data: blocks, error: listError } = await supabase
    .from("site_page_blocks")
    .select("id, position")
    .eq("page_id", pageId)
    .order("position");

  if (listError || !blocks) {
    return failure("site-pages", listError, "We could not reorder blocks just now. Please try again.");
  }

  const index = blocks.findIndex((block) => block.id === blockId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= blocks.length) {
    return { status: "success" };
  }

  const a = blocks[index];
  const b = blocks[swapWith];

  const [{ error: errorA }, { error: errorB }] = await Promise.all([
    supabase.from("site_page_blocks").update({ position: b.position }).eq("id", a.id),
    supabase.from("site_page_blocks").update({ position: a.position }).eq("id", b.id),
  ]);

  if (errorA || errorB) {
    return failure("site-pages", errorA ?? errorB, "We could not reorder blocks just now. Please try again.");
  }

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success" };
}

export async function updateTextBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return { status: "error", message: "We could not tell which block this is." };

  const parsed = textBlockSchema.safeParse({ heading: text(formData, "heading") ?? null, body: text(formData, "body") ?? "" });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_page_blocks")
    .update({ content: { heading: parsed.data.heading, body: parsed.data.body } })
    .eq("id", blockId);

  if (error) return failure("site-pages", error, "We could not save that block just now. Please try again.");

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success", message: "Block saved." };
}

export async function updateSectionBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return { status: "error", message: "We could not tell which block this is." };

  const parsed = sectionBlockSchema.safeParse({ heading: text(formData, "heading") ?? "", body: text(formData, "body") ?? null });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_page_blocks")
    .update({ content: { heading: parsed.data.heading, body: parsed.data.body } })
    .eq("id", blockId);

  if (error) return failure("site-pages", error, "We could not save that block just now. Please try again.");

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success", message: "Block saved." };
}

export async function updateColumnsBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return { status: "error", message: "We could not tell which block this is." };

  const count = Number(text(formData, "columnCount") ?? "0");
  const items = Array.from({ length: count }, (_, index) => ({
    heading: text(formData, `column-${index}-heading`) ?? null,
    body: text(formData, `column-${index}-body`) ?? null,
  }));

  const parsed = columnsBlockSchema.safeParse({ items });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("site_page_blocks").update({ content: { items: parsed.data.items } }).eq("id", blockId);

  if (error) return failure("site-pages", error, "We could not save that block just now. Please try again.");

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success", message: "Block saved." };
}

export async function updateImageBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return { status: "error", message: "We could not tell which block this is." };

  const caption = text(formData, "caption") ?? null;
  const file = readBlockImage(formData);

  const supabase = await createClient();

  if (!file) {
    // Caption-only save — the image itself is unchanged.
    const { data: existing } = await supabase.from("site_page_blocks").select("content").eq("id", blockId).single();
    const path = (existing?.content as { path?: string } | null)?.path ?? null;

    const { error } = await supabase.from("site_page_blocks").update({ content: { path, caption } }).eq("id", blockId);
    if (error) return failure("site-pages", error, "We could not save that block just now. Please try again.");

    revalidatePath(`/admin/website/pages/${pageId}`);
    return { status: "success", message: "Block saved." };
  }

  const problem = describeBlockImageProblem(file);
  if (problem) {
    return { status: "error", message: problem, fieldErrors: { image: [problem] } };
  }

  const uploaded = await uploadBlockImage(organizationId, blockId, file);
  if (!uploaded.ok) {
    return { status: "error", message: "We could not upload that image. Please try again." };
  }

  const { error } = await supabase
    .from("site_page_blocks")
    .update({ content: { path: uploaded.path, caption } })
    .eq("id", blockId);

  if (error) return failure("site-pages", error, "We could not save that block just now. Please try again.");

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success", message: "Image saved." };
}

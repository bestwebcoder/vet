"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import {
  describeBlockImageProblem,
  readBlockImage,
  removeBlockImageObject,
  uploadBlockImage,
  uploadCardImage,
} from "@/features/site-pages/block-image";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  cardsBlockSchema,
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
    cards: { items: [{ icon: null, title: "", body: null, path: null }] },
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

/** A drag settles as a full new order in one page — a plain position rewrite (no reparenting), same shape as home sections' reorder. */
export async function reorderBlocksAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const pageId = text(formData, "pageId");
  const raw = text(formData, "order");
  if (!pageId || !raw) return { status: "error", message: "We could not tell the new order." };

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
    orderedIds.map((id, position) => supabase.from("site_page_blocks").update({ position }).eq("id", id).eq("page_id", pageId)),
  );

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    return failure("site-pages", firstError, "We could not save that order just now. Please try again.");
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

/**
 * One save covers every card in the block: their text, and any pictures newly
 * picked or cleared. Cards are positional — the form posts `cardCount` and
 * `card-<index>-*` fields — so reordering or removing one is a matter of the
 * browser re-posting the list it now holds.
 */
export async function updateCardsBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return { status: "error", message: "We could not tell which block this is." };

  const count = Number(text(formData, "cardCount") ?? "0");
  const items = Array.from({ length: count }, (_, index) => ({
    icon: text(formData, `card-${index}-icon`) ?? null,
    title: text(formData, `card-${index}-title`) ?? "",
    body: text(formData, `card-${index}-body`) ?? null,
  }));

  const parsed = cardsBlockSchema.safeParse({ items });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  // The stored paths, so a card that keeps its picture keeps it, and one that
  // replaces or clears it leaves no object behind.
  const { data: existing } = await supabase.from("site_page_blocks").select("content").eq("id", blockId).maybeSingle();
  const storedItems: { path?: string | null }[] = Array.isArray(existing?.content?.items) ? existing.content.items : [];

  const superseded: string[] = [];
  const withImages = [];

  for (const [index, item] of parsed.data.items.entries()) {
    const previousPath = storedItems[index]?.path ?? null;
    const file = formData.get(`card-${index}-image`);
    const cleared = formData.get(`card-${index}-removeImage`) === "on";

    let path: string | null = previousPath;

    if (file instanceof File && file.size > 0) {
      const problem = describeBlockImageProblem(file);
      if (problem) {
        return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { [`card-${index}-image`]: [problem] } };
      }

      const upload = await uploadCardImage(organizationId, file);
      if (!upload.ok) return { status: "error", message: "We could not upload that image just now. Please try again." };

      path = upload.path;
      if (previousPath) superseded.push(previousPath);
    } else if (cleared) {
      path = null;
      if (previousPath) superseded.push(previousPath);
    }

    withImages.push({ icon: item.icon, title: item.title, body: item.body, path });
  }

  // Cards removed from the end of the list leave their pictures behind otherwise.
  for (const stored of storedItems.slice(parsed.data.items.length)) {
    if (stored?.path) superseded.push(stored.path);
  }

  const { error } = await supabase.from("site_page_blocks").update({ content: { items: withImages } }).eq("id", blockId);

  if (error) return failure("site-pages", error, "We could not save that block just now. Please try again.");

  for (const path of superseded) await removeBlockImageObject(path);

  revalidatePath(`/admin/website/pages/${pageId}`);
  return { status: "success", message: "Block saved." };
}

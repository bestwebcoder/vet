"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { siteContentFieldsFor } from "@/features/site-content/fields";
import { pageDefinition } from "@/lib/page-sections";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * One save for one page's fields. A field left blank isn't stored as an empty
 * override — its row is removed instead, so the page falls back to the
 * built-in default rather than rendering blank.
 *
 * Scoped to the posted page, and this is load-bearing: clearing a blank field
 * means deleting its row, so an action that considered the whole registry
 * would wipe every *other* page's copy the moment one page was saved on its
 * own. It only ever considered the whole registry before because there was
 * only ever one form, covering every page at once.
 */
export async function updateSiteContentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return { status: "error", message: "Your account is not linked to a practice yet." };
  }

  const page = text(formData, "page") ?? "";
  const fields = siteContentFieldsFor(page);

  if (fields.length === 0) {
    return { status: "error", message: "We could not tell which page this is." };
  }

  const supabase = await createClient();

  const rows = fields.map((field) => ({ key: field.key, value: text(formData, field.key) }));
  const toUpsert = rows
    .filter((row): row is { key: string; value: string } => Boolean(row.value))
    .map((row) => ({ organization_id: organizationId, key: row.key, value: row.value }));
  const toClear = rows.filter((row) => !row.value).map((row) => row.key);

  const [{ error: upsertError }, deleteResult] = await Promise.all([
    toUpsert.length > 0
      ? supabase.from("site_content").upsert(toUpsert, { onConflict: "organization_id,key" })
      : Promise.resolve({ error: null }),
    toClear.length > 0
      ? supabase.from("site_content").delete().eq("organization_id", organizationId).in("key", toClear)
      : Promise.resolve({ error: null }),
  ]);

  if (upsertError || deleteResult.error) {
    console.error("[site-content] save failed", upsertError ?? deleteResult.error);
    return { status: "error", message: "We could not save these changes just now. Please try again." };
  }

  revalidatePath("/admin/website");
  revalidatePath(`/admin/website/sections/${page}`);

  // The footer is on every public page, so its own save has to clear all of
  // them rather than the one page it belongs to.
  if (page === "footer") {
    revalidatePath("/", "layout");
  } else {
    const href = pageDefinition(page)?.href;
    if (href) revalidatePath(href);
  }

  return { status: "success", message: "Page content saved." };
}

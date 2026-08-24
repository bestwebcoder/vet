"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { SITE_CONTENT_FIELDS } from "@/features/site-content/fields";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * One save for every field in the registry. A field left blank isn't stored
 * as an empty override — its row is removed instead, so the page falls back
 * to the built-in default rather than rendering blank.
 */
export async function updateSiteContentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return { status: "error", message: "Your account is not linked to a practice yet." };
  }

  const supabase = await createClient();

  const rows = SITE_CONTENT_FIELDS.map((field) => ({ key: field.key, value: text(formData, field.key) }));
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

  revalidatePath("/admin/settings");
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/services");
  revalidatePath("/contact");

  return { status: "success", message: "Website content updated." };
}

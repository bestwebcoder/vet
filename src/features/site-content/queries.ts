import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** Site content reads — the public marketing pages' admin-editable copy. */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

/**
 * For every signed-out public page. Service role, same reasoning as
 * getPublicOrganizationInfo: reached before any session exists.
 */
export async function getPublicSiteContent(organizationId: string): Promise<Record<string, string>> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("site_content")
    .select("key, value")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[site-content] public read failed", error);
    return {};
  }

  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}

/** For the admin editor — RLS-scoped, only an admin of this organization can read it. */
export async function getSiteContentForAdmin(organizationId: string): Promise<Result<Record<string, string>>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("site_content")
    .select("key, value")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[site-content] admin read failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: Object.fromEntries((data ?? []).map((row) => [row.key, row.value])) };
}

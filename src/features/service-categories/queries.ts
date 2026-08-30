import { createClient } from "@/lib/supabase/server";

/**
 * Service category reads. §7.3 — administrator-configurable, same shape as
 * `src/features/vaccination-schedules/queries.ts`.
 */

export type ServiceCategory = {
  id: string;
  name: string;
  /** The blurb under this heading on the public services page. */
  description: string | null;
  /** An icon key from src/lib/icons.ts, shown beside the heading. */
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

function toCategory(row: {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}): ServiceCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export async function listActiveCategories(): Promise<Result<ServiceCategory[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select("id, name, description, icon, sort_order, is_active")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[service-categories] active list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toCategory) };
}

export async function listAllCategories(): Promise<Result<ServiceCategory[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select("id, name, description, icon, sort_order, is_active")
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[service-categories] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toCategory) };
}

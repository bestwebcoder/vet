import { createClient } from "@/lib/supabase/server";

/**
 * Service reads.
 *
 * Minimal by design: full pricing and service management is Phase 7. This is
 * only what booking needs — which services exist and how long they take.
 */

export type ServiceSummary = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export async function listServices(): Promise<Result<ServiceSummary[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select("id, name, description, duration_minutes")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[services] list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      durationMinutes: row.duration_minutes,
    })),
  };
}

export async function getService(serviceId: string): Promise<Result<ServiceSummary | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select("id, name, description, duration_minutes")
    .eq("id", serviceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[services] get failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: data
      ? {
          id: data.id,
          name: data.name,
          description: data.description,
          durationMinutes: data.duration_minutes,
        }
      : null,
  };
}

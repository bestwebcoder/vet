import { createClient } from "@/lib/supabase/server";

/**
 * Organization reads. Minimal by design — a general settings screen is
 * Phase 10 (`ADMIN_NAV`'s "Settings" entry); this only reads what the
 * invoice PDF needs.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type Organization = {
  id: string;
  name: string;
  paymentInstructions: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

export async function getOwnOrganization(organizationId: string): Promise<Result<Organization | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, payment_instructions, quiet_hours_start, quiet_hours_end")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[organizations] get failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: data
      ? {
          id: data.id,
          name: data.name,
          paymentInstructions: data.payment_instructions,
          quietHoursStart: data.quiet_hours_start,
          quietHoursEnd: data.quiet_hours_end,
        }
      : null,
  };
}

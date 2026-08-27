import { createClient } from "@/lib/supabase/server";

/**
 * Branch reads for the Settings screen.
 *
 * A practice's branches are the clinics it works from. Every appointment,
 * doctor and availability window may point at one, which is why a branch is
 * deactivated rather than deleted once it has been used.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type Branch = {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
  isActive: boolean;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  /** Whether anything points at this branch — decides Delete against Deactivate. */
  inUse: boolean;
};

const BRANCH_COLUMNS = "id, name, slug, is_primary, is_active, email, phone, address, city";

export async function listBranchesForAdmin(organizationId: string): Promise<Result<Branch[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("branches")
    .select(BRANCH_COLUMNS)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("name");

  if (error) {
    console.error("[branches] admin list failed", error);
    return { status: "error" };
  }

  const branches = data ?? [];
  if (branches.length === 0) return { status: "ok", data: [] };

  // One query per referencing table rather than per branch: three reads for
  // the whole list, however many branches a practice has.
  const ids = branches.map((row) => row.id);
  const [appointments, availability, doctors] = await Promise.all([
    supabase.from("appointments").select("branch_id").in("branch_id", ids),
    supabase.from("doctor_availability").select("branch_id").in("branch_id", ids),
    supabase.from("doctors").select("primary_branch_id").in("primary_branch_id", ids),
  ]);

  const used = new Set<string>();
  for (const row of appointments.data ?? []) if (row.branch_id) used.add(row.branch_id);
  for (const row of availability.data ?? []) if (row.branch_id) used.add(row.branch_id);
  for (const row of doctors.data ?? []) if (row.primary_branch_id) used.add(row.primary_branch_id);

  return {
    status: "ok",
    data: branches.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      isPrimary: row.is_primary,
      isActive: row.is_active,
      email: row.email,
      phone: row.phone,
      address: row.address,
      city: row.city,
      inUse: used.has(row.id),
    })),
  };
}

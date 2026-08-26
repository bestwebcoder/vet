import { createClient } from "@/lib/supabase/server";

/**
 * The roster behind /admin/users.
 *
 * Deliberately not every person in the practice — clients and doctors
 * already have full lifecycle management at /admin/clients and
 * /admin/doctors (create, edit, deactivate/reactivate). This section covers
 * what those two don't: the practice's admins, and anyone registered as
 * staff (see the `staff` table) who has not been granted a role yet — the
 * gap the demo seed's "no role granted" account exists to illustrate. Once
 * setTeamRoleAction moves someone onto doctor or client, they carry on being
 * managed from that role's own page and drop out of this list. Every other
 * clinic-side role stays here — see MANAGED_TEAM_ROLES.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };
export type PaginatedResult<T> =
  | { status: "ok"; data: T[]; totalCount: number; page: number; pageSize: number }
  | { status: "error" };

/**
 * The roles this page manages. Doctors and clients are deliberately absent —
 * they have their own pages — but every other clinic-side role must appear
 * here, or granting someone one makes them vanish from the only screen that
 * could change it back.
 */
export const MANAGED_TEAM_ROLES = ["admin", "finance_manager", "lab", "receptionist"] as const;

export type TeamRole = (typeof MANAGED_TEAM_ROLES)[number] | "none";

export type TeamMember = {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: TeamRole;
  /** Whether a staff row backs this person — gates the "Delete" action, which removes that row. */
  hasStaffRecord: boolean;
};

type UserProfile = { full_name: string; email: string; phone: string | null };
type Related = UserProfile | UserProfile[] | null;

function one(value: Related): UserProfile | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Paginated over a JS-merged array, not a single `.range()` query: the
 * roster is a union of two different tables (active admins, pending staff)
 * with different filters each, so there is no one query to page against.
 * Both halves are practice-scale on their own (admins and staff, not
 * patients), so fetching each in full and slicing the merged, sorted result
 * is simple and still gives a real ceiling — unlike the unpaginated version
 * this replaces, which rendered everyone on one page.
 */
export async function getTeamRoster(
  organizationId: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<TeamMember>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? 25;
  const result = await getFullTeamRoster(organizationId);
  if (result.status === "error") return result;

  const start = (page - 1) * pageSize;
  return {
    status: "ok",
    data: result.data.slice(start, start + pageSize),
    totalCount: result.data.length,
    page,
    pageSize,
  };
}

async function getFullTeamRoster(organizationId: string): Promise<Result<TeamMember[]>> {
  const supabase = await createClient();

  const [{ data: roleRows, error: roleError }, { data: staffRows, error: staffError }] = await Promise.all([
    supabase
      .from("user_roles")
      .select("user_id, role:role_id (slug), user:user_id (full_name, email, phone)")
      .eq("organization_id", organizationId)
      .is("revoked_at", null),
    supabase
      .from("staff")
      .select("user_id, user:user_id (full_name, email, phone)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
  ]);

  if (roleError || staffError) {
    console.error("[team] roster failed", roleError ?? staffError);
    return { status: "error" };
  }

  const roleHolders = new Set((roleRows ?? []).map((row) => row.user_id));
  const staffHolders = new Set((staffRows ?? []).map((row) => row.user_id));

  const managed: TeamMember[] = (roleRows ?? [])
    .flatMap((row) => {
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      const slug = role?.slug;
      if (!slug || !(MANAGED_TEAM_ROLES as readonly string[]).includes(slug)) return [];

      const user = one(row.user);
      return [
        {
          userId: row.user_id,
          fullName: user?.full_name ?? "Unknown",
          email: user?.email ?? "",
          phone: user?.phone ?? null,
          role: slug as TeamRole,
          hasStaffRecord: staffHolders.has(row.user_id),
        },
      ];
    });

  const pending: TeamMember[] = (staffRows ?? [])
    .filter((row) => !roleHolders.has(row.user_id))
    .map((row) => {
      const user = one(row.user);
      return {
        userId: row.user_id,
        fullName: user?.full_name ?? "Unknown",
        email: user?.email ?? "",
        phone: user?.phone ?? null,
        role: "none" as const,
        hasStaffRecord: true,
      };
    });

  return {
    status: "ok",
    data: [...managed, ...pending].sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

export type RemovedTeamMember = { userId: string; fullName: string; email: string };

/** People deleteTeamMemberAction has removed — restoreTeamMemberAction's undo list. */
export async function getRemovedTeamMembers(organizationId: string): Promise<Result<RemovedTeamMember[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff")
    .select("user_id, user:user_id (full_name, email)")
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null);

  if (error) {
    console.error("[team] removed roster failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? [])
      .map((row) => {
        const user = one(row.user as Related);
        return { userId: row.user_id, fullName: user?.full_name ?? "Unknown", email: user?.email ?? "" };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

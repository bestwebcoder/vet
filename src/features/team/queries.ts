import { createClient } from "@/lib/supabase/server";

/**
 * The roster behind /admin/settings' "Team & roles" section.
 *
 * Deliberately not every person in the practice — clients and doctors
 * already have full lifecycle management at /admin/clients and
 * /admin/doctors (create, edit, deactivate/reactivate). This section covers
 * what those two don't: the practice's admins, and anyone registered as
 * staff (see the `staff` table) who has not been granted a role yet — the
 * gap the demo seed's "no role granted" account exists to illustrate. Once
 * setTeamRoleAction moves someone onto doctor or client, they carry on being
 * managed from that role's own page and drop out of this list.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type TeamRole = "admin" | "none";

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

export async function getTeamRoster(organizationId: string): Promise<Result<TeamMember[]>> {
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

  const admins: TeamMember[] = (roleRows ?? [])
    .filter((row) => {
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      return role?.slug === "admin";
    })
    .map((row) => {
      const user = one(row.user);
      return {
        userId: row.user_id,
        fullName: user?.full_name ?? "Unknown",
        email: user?.email ?? "",
        phone: user?.phone ?? null,
        role: "admin" as const,
        hasStaffRecord: staffHolders.has(row.user_id),
      };
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
    data: [...admins, ...pending].sort((a, b) => a.fullName.localeCompare(b.fullName)),
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

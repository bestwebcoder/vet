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

/**
 * Every role a person can hold, plus "none" for someone registered as staff
 * who has not been granted one yet. Each is a tab on /admin/users.
 *
 * Doctors and clients keep their own pages for the full lifecycle (creating a
 * pet owner, editing a doctor's profile); they appear here so an admin can see
 * and change *who holds what*, which is the one thing those pages do not do.
 */
export const ROSTER_ROLES = [
  "admin",
  "doctor",
  "client",
  "finance_manager",
  "lab",
  "receptionist",
] as const;

export type RosterRole = (typeof ROSTER_ROLES)[number];
export type TeamRole = RosterRole | "none";

/** A tab on the roster: every role, plus everyone, plus the not-yet-granted. */
export type RosterTab = TeamRole | "all";

export const ROSTER_TABS: RosterTab[] = ["all", ...ROSTER_ROLES, "none"];

export function isRosterTab(value: string): value is RosterTab {
  return (ROSTER_TABS as string[]).includes(value);
}

export type RosterCounts = Record<RosterTab, number>;

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

function toMember(
  userId: string,
  user: UserProfile | null,
  role: TeamRole,
  hasStaffRecord: boolean,
): TeamMember {
  return {
    userId,
    fullName: user?.full_name ?? "Unknown",
    email: user?.email ?? "",
    phone: user?.phone ?? null,
    role,
    hasStaffRecord,
  };
}

/**
 * `!inner` matters: without it PostgREST returns the parent row even when the
 * embedded filter excludes the role, so `.eq("role.slug", …)` would just null
 * out `role` instead of narrowing the result to that role's holders.
 */
const GRANT_COLUMNS = "user_id, created_at, role:role_id!inner (slug), user:user_id (full_name, email, phone)";

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by GRANT_COLUMNS */
function slugOf(row: any): string | null {
  const role = Array.isArray(row.role) ? row.role[0] : row.role;
  return role?.slug ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The user ids of everyone in the practice registered as staff, active or not. */
async function staffUserIds(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff")
    .select("user_id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  return new Set((data ?? []).map((row) => row.user_id));
}

/**
 * Staff who hold no active role — the gap this page exists to surface, and
 * always a short list: someone sits here only between being invited and being
 * given a role. Small enough to read in full and slice in memory.
 */
async function pendingStaff(organizationId: string): Promise<Result<TeamMember[]>> {
  const supabase = await createClient();

  const [{ data: staffRows, error: staffError }, { data: grantRows, error: grantError }] = await Promise.all([
    supabase
      .from("staff")
      .select("user_id, user:user_id (full_name, email, phone)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase.from("user_roles").select("user_id").eq("organization_id", organizationId).is("revoked_at", null),
  ]);

  if (staffError || grantError) {
    console.error("[team] pending staff failed", staffError ?? grantError);
    return { status: "error" };
  }

  const roleHolders = new Set((grantRows ?? []).map((row) => row.user_id));

  return {
    status: "ok",
    data: (staffRows ?? [])
      .filter((row) => !roleHolders.has(row.user_id))
      .map((row) => toMember(row.user_id, one(row.user as Related), "none", true))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

/**
 * One page of role holders, paged in Postgres rather than in memory — a
 * practice's clients alone can outgrow anything worth reading in full, which
 * the previous admins-and-staff-only version never had to consider.
 *
 * Ordered newest grant first. Ordering by the person's name would be nicer but
 * is not available: full_name lives on the embedded users row, and PostgREST
 * cannot order parent rows by an embedded column, so sorting by name would
 * only ever sort within the page that was already fetched — worse than an
 * order that is at least honest.
 */
async function roleHolderPage(
  organizationId: string,
  role: RosterRole | null,
  start: number,
  limit: number,
  staffIds: Set<string>,
): Promise<Result<{ members: TeamMember[]; totalCount: number }>> {
  const supabase = await createClient();

  let query = supabase
    .from("user_roles")
    .select(GRANT_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId)
    .is("revoked_at", null);

  if (role) query = query.eq("role.slug", role);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(start, start + Math.max(limit, 1) - 1);

  if (error) {
    console.error("[team] role holders failed", error);
    return { status: "error" };
  }

  const members = (data ?? []).flatMap((row) => {
    const slug = slugOf(row);
    if (!slug || !(ROSTER_ROLES as readonly string[]).includes(slug)) return [];
    return [toMember(row.user_id, one(row.user as Related), slug as TeamRole, staffIds.has(row.user_id))];
  });

  return { status: "ok", data: { members, totalCount: count ?? 0 } };
}

/** How many people sit under each tab, for the badges on the tab strip. */
export async function getRosterCounts(organizationId: string): Promise<Result<RosterCounts>> {
  const supabase = await createClient();

  const [{ data: grantRows, error: grantError }, pending] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role:role_id (slug)")
      .eq("organization_id", organizationId)
      .is("revoked_at", null),
    pendingStaff(organizationId),
  ]);

  if (grantError || pending.status === "error") {
    console.error("[team] roster counts failed", grantError);
    return { status: "error" };
  }

  const counts = Object.fromEntries(ROSTER_TABS.map((tab) => [tab, 0])) as RosterCounts;

  for (const row of grantRows ?? []) {
    const slug = slugOf(row);
    if (slug && slug in counts) counts[slug as RosterTab] += 1;
  }

  counts.none = pending.data.length;
  counts.all = (grantRows ?? []).filter((row) => {
    const slug = slugOf(row);
    return slug !== null && (ROSTER_ROLES as readonly string[]).includes(slug);
  }).length + counts.none;

  return { status: "ok", data: counts };
}

/**
 * One page of one tab.
 *
 * "All" is a concatenation of two differently-shaped queries — the short
 * pending-staff list first, then role holders — so its paging walks the
 * pending entries before spilling into a Postgres-side range on the rest.
 * Anything else is a single query and pages straight through the database.
 */
export async function getTeamRoster(
  organizationId: string,
  options: { page?: number; pageSize?: number; tab?: RosterTab } = {},
): Promise<PaginatedResult<TeamMember>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? 25;
  const tab = options.tab ?? "all";
  const start = (page - 1) * pageSize;

  if (tab === "none") {
    const pending = await pendingStaff(organizationId);
    if (pending.status === "error") return { status: "error" };

    return {
      status: "ok",
      data: pending.data.slice(start, start + pageSize),
      totalCount: pending.data.length,
      page,
      pageSize,
    };
  }

  const staffIds = await staffUserIds(organizationId);

  if (tab !== "all") {
    const result = await roleHolderPage(organizationId, tab, start, pageSize, staffIds);
    if (result.status === "error") return { status: "error" };

    return { status: "ok", data: result.data.members, totalCount: result.data.totalCount, page, pageSize };
  }

  const pending = await pendingStaff(organizationId);
  if (pending.status === "error") return { status: "error" };

  const pendingCount = pending.data.length;
  const end = start + pageSize;

  const fromPending = pending.data.slice(Math.min(start, pendingCount), Math.min(end, pendingCount));
  const roleStart = Math.max(0, start - pendingCount);
  const roleWanted = pageSize - fromPending.length;

  if (roleWanted <= 0) {
    const counts = await roleHolderPage(organizationId, null, 0, 1, staffIds);
    const roleTotal = counts.status === "ok" ? counts.data.totalCount : 0;
    return { status: "ok", data: fromPending, totalCount: pendingCount + roleTotal, page, pageSize };
  }

  const result = await roleHolderPage(organizationId, null, roleStart, roleWanted, staffIds);
  if (result.status === "error") return { status: "error" };

  return {
    status: "ok",
    data: [...fromPending, ...result.data.members],
    totalCount: pendingCount + result.data.totalCount,
    page,
    pageSize,
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

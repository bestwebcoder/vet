import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Session and role lookup for server components.
 *
 * Server-only by construction: they reach cookies through next/headers, so
 * importing them into a client component fails at build time.
 *
 * These helpers decide what a person can *reach*. What they can *read* is
 * decided by row level security in Postgres — a guard here is convenience and
 * a clear error message, never the security boundary.
 */

export type RoleSlug =
  | "client"
  | "doctor"
  | "admin"
  | "super_admin"
  | "finance_manager"
  | "lab"
  | "receptionist";

/**
 * The narrower clinic-side roles. They share the /admin area with admins but
 * see only their own navigation and reach only their own pages — what they can
 * actually read is decided by row level security (see
 * 20260917000100_staff_roles.sql), so this list drives menus and redirects, not
 * security.
 */
export const SUPPORT_ROLES = ["finance_manager", "lab", "receptionist"] as const satisfies readonly RoleSlug[];

/**
 * The built-in slugs. A practice can now define its own roles, whose slugs are
 * not in this union — they are filtered out of `roles` deliberately, so no
 * `hasRole` check anywhere can be satisfied by a role somebody invented this
 * morning. Custom roles work through permissions, and only through them.
 */
export const KNOWN_ROLES: RoleSlug[] = [
  "client",
  "doctor",
  "admin",
  "super_admin",
  "finance_manager",
  "lab",
  "receptionist",
];

/**
 * Areas of the app, most privileged first. Order drives the landing redirect.
 *
 * The three support roles share /admin with admins, so they sit below admin
 * and above doctor: someone holding both admin and one of these lands on the
 * same page either way, and a support role alone still lands somewhere real.
 */
export const ROLE_AREAS = [
  { role: "admin", href: "/admin" },
  { role: "finance_manager", href: "/admin" },
  { role: "lab", href: "/admin" },
  { role: "receptionist", href: "/admin" },
  { role: "doctor", href: "/doctor" },
  { role: "client", href: "/client" },
] as const satisfies readonly { role: RoleSlug; href: string }[];

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  /**
   * The built-in slugs this person holds. A custom role does not appear here —
   * it has no slug any of this file knows about, which is the point: what a
   * custom role can do is in `permissions`.
   */
  roles: RoleSlug[];
  /**
   * Every permission key this person holds, through any role in any of their
   * practices — the union, matching `roles`. Where it matters which practice a
   * permission is held in, ask the database: only its policies are scoped per
   * organization, and only they are the boundary.
   */
  permissions: string[];
  /**
   * The subset of `permissions` granted through a role this practice defined
   * itself.
   *
   * The built-in roles carry permission rows too (20261006000100), so that the
   * Roles screen can describe them instead of saying "defined in the system".
   * Those rows restate access those roles already had — but the permission
   * checks beside every `hasRole` check were written as the way a CUSTOM role
   * reaches a page, and reading the full union there would have turned an
   * accurate description into a grant: every doctor holding `clients.view`
   * would suddenly reach the administration area. So reachability asks this,
   * and only this.
   */
  customPermissions: string[];
  organizationIds: string[];
};

/**
 * Returns the signed-in user, or null. Does not redirect.
 *
 * Wrapped in React's cache() so the public layout (which now reads the
 * session to decide the header's CTA) and the page it wraps don't each pay
 * for a separate round trip within the same render.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) return null;

  const userId = claims.claims.sub as string;

  const [{ data: profile }, { data: grants }] = await Promise.all([
    supabase.from("users").select("full_name, email, phone, avatar_url").eq("id", userId).single(),
    supabase
      .from("user_roles")
      .select("organization_id, roles(slug, deleted_at, is_system, role_permissions(permission_key))")
      .eq("user_id", userId)
      .is("revoked_at", null),
  ]);

  // A confirmed session with no profile row means provisioning failed part way
  // through. Treat it as signed out rather than rendering a half-built user.
  if (!profile) return null;

  // PostgREST returns an embedded one-to-one as an object or a single-element
  // array depending on how it inferred the relationship; both shapes appear.
  const grantedRoles = (grants ?? [])
    .map((grant) => (Array.isArray(grant.roles) ? grant.roles[0] : grant.roles))
    .filter((role): role is NonNullable<typeof role> => Boolean(role) && !role!.deleted_at);

  const roles = grantedRoles
    .map((role) => role.slug as RoleSlug | undefined)
    .filter((slug): slug is RoleSlug => slug !== undefined && KNOWN_ROLES.includes(slug));

  const permissionsFrom = (roles: typeof grantedRoles) =>
    roles.flatMap((role) => (role.role_permissions ?? []).map((entry) => entry.permission_key as string));

  const permissions = permissionsFrom(grantedRoles);
  const customPermissions = permissionsFrom(grantedRoles.filter((role) => !role.is_system));

  return {
    id: userId,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    roles: [...new Set(roles)],
    permissions: [...new Set(permissions)],
    customPermissions: [...new Set(customPermissions)],
    organizationIds: [...new Set((grants ?? []).map((grant) => grant.organization_id))],
  };
});

/** Requires a signed-in user; sends them to sign in otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export function hasRole(user: SessionUser, ...roles: RoleSlug[]): boolean {
  return roles.some((role) => user.roles.includes(role));
}

/** Whether this person holds any of these permissions, through any role. */
export function hasPermission(user: SessionUser, ...keys: string[]): boolean {
  return keys.some((key) => user.permissions.includes(key));
}

/**
 * The reachability question: whether a role this practice defined itself
 * carries any of these permissions.
 *
 * Every place that opens a page on a permission sits beside a `hasRole` check
 * that already admits the built-in roles by name. Asking the full union there
 * would double-count them — and since 20261006000100 gave the built-ins their
 * real permission rows, it would also hand the administration area to every
 * doctor. What is left for a permission to decide is the case the permission
 * model was added for: a practice's own "Nurse".
 */
export function hasCustomRolePermission(user: SessionUser, ...keys: string[]): boolean {
  return keys.some((key) => user.customPermissions.includes(key));
}

/**
 * Requires one of these permissions to reach a page.
 *
 * The counterpart to requireRole, and the one to prefer: a page guarded this
 * way admits a role the practice defined itself, which a slug check never can.
 * Still only reachability — the policies decide what the page then shows.
 */
export async function requirePermission(...keys: string[]): Promise<SessionUser> {
  const user = await requireUser();

  if (!hasCustomRolePermission(user, ...keys)) {
    redirect("/no-access");
  }

  return user;
}

/**
 * Requires one of the given roles for an area of the app.
 *
 * Sends the user to an explanatory page rather than their own dashboard: a
 * silent bounce leaves someone who followed a colleague's link wondering
 * whether the page exists.
 */
export async function requireRole(...roles: RoleSlug[]): Promise<SessionUser> {
  const user = await requireUser();

  if (!hasRole(user, ...roles)) {
    redirect("/no-access");
  }

  return user;
}

/** Where this user's own work lives. Null when no role has been granted yet. */
export function homeHrefFor(user: SessionUser): string | null {
  // super_admin is architecture only and is not surfaced as its own area yet,
  // so it is treated as an administrator of the current organization.
  const effective: RoleSlug[] = user.roles.includes("super_admin")
    ? [...user.roles, "admin"]
    : user.roles;

  return ROLE_AREAS.find((area) => effective.includes(area.role))?.href ?? null;
}

/**
 * Where a public page's Book button leads.
 *
 * Somebody already signed in goes to their own area — a client to their
 * dashboard, a doctor or an administrator to theirs — and anybody else goes to
 * sign in, because booking needs an account and a login page that says so
 * beats a booking screen that bounces them. The same rule the public header
 * uses for Go to dashboard / Sign in, so the two cannot disagree on one page.
 */
export async function bookingHrefForVisitor(): Promise<string> {
  const user = await getSessionUser();
  return (user && homeHrefFor(user)) || "/login";
}

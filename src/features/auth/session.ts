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
  roles: RoleSlug[];
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
      .select("organization_id, roles(slug)")
      .eq("user_id", userId)
      .is("revoked_at", null),
  ]);

  // A confirmed session with no profile row means provisioning failed part way
  // through. Treat it as signed out rather than rendering a half-built user.
  if (!profile) return null;

  const roles = (grants ?? [])
    .map((grant) => {
      const role = Array.isArray(grant.roles) ? grant.roles[0] : grant.roles;
      return role?.slug as RoleSlug | undefined;
    })
    .filter((slug): slug is RoleSlug => Boolean(slug));

  return {
    id: userId,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    roles: [...new Set(roles)],
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

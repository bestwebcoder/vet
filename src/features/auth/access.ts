import { redirect } from "next/navigation";

import {
  hasPermission,
  hasRole,
  requireUser,
  type RoleSlug,
  type SessionUser,
} from "@/features/auth/session";

/**
 * Which roles may reach each section of /admin.
 *
 * The three narrower clinic-side roles share the /admin area with admins, so
 * the area layout alone no longer decides who gets in — every page states the
 * roles it serves. Anything that does not opt in stays ADMIN_ONLY, which is
 * what all 51 admin pages meant before these roles existed: a page nobody
 * thought about is closed, not open.
 *
 * This is reachability, not authority. Row level security
 * (20260917000100_staff_roles.sql) decides what any of them can actually read
 * or write, and a receptionist who reaches Vaccinations still cannot record
 * one. Keep this in step with ADMIN_NAV's per-item `roles`, which decides what
 * the same person sees in the menu.
 */

export const ADMIN_ONLY: RoleSlug[] = ["admin", "super_admin"];

export const ACCESS = {
  /** The dashboard, profile and search: everyone with a desk in this area. */
  shared: [...ADMIN_ONLY, "finance_manager", "lab", "receptionist"] as RoleSlug[],

  /** Invoices, payments, transactions and the financial reports. */
  finance: [...ADMIN_ONLY, "finance_manager"] as RoleSlug[],

  /** Diagnostic tests and their results. */
  lab: [...ADMIN_ONLY, "lab"] as RoleSlug[],

  /** The front desk: booking, services, doctor information, schedules, messages. */
  reception: [...ADMIN_ONLY, "receptionist"] as RoleSlug[],
} as const;

/**
 * The permission that opens each area to a role the practice defined itself.
 *
 * One per route group rather than one per page: the groups already carve
 * /admin up the way a practice does, and a permission per page would be a
 * second matrix to keep in step with the first. Within a group, what a person
 * actually sees is still decided per query by row level security — a custom
 * role that reaches Billing with only `billing.view` gets a read-only screen
 * because the write policies say no, not because a page decided so.
 */
export const AREA_PERMISSIONS = {
  shared: [] as string[],
  finance: ["billing.view", "reports.view"],
  lab: ["clinical.view"],
  reception: ["appointments.view", "clients.view", "services.view", "preventive.view"],
} as const satisfies Record<keyof typeof ACCESS, readonly string[]>;

export type AreaKey = keyof typeof ACCESS;

/**
 * Guards one area of /admin, admitting either a built-in role or a custom one
 * holding the right permission.
 *
 * Replaces `requireAccess("x")`, which could only ever admit the seven
 * slugs this application ships with — a practice's own "Nurse" would have
 * bounced off the page whatever its permissions said.
 */
export async function requireAccess(area: AreaKey): Promise<SessionUser> {
  const user = await requireUser();

  if (hasRole(user, ...ACCESS[area])) return user;

  // `shared` is the dashboard, profile and search: anyone with a desk here,
  // which is anyone holding any permission at all.
  const permitted =
    area === "shared" ? user.permissions.length > 0 : hasPermission(user, ...AREA_PERMISSIONS[area]);

  if (!permitted) redirect("/no-access");

  return user;
}

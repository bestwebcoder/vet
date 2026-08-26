import type { RoleSlug } from "@/features/auth/session";

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

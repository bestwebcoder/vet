import {
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  FlaskConical,
  Globe,
  Home,
  MessageSquare,
  PawPrint,
  LayoutDashboard,
  Users,
  Receipt,
  Settings,
  Shield,
  Stethoscope,
  Syringe,
  UserCog,
  UserRound,
  Wallet,
  Worm,
  type LucideIcon,
} from "lucide-react";

import type { RoleSlug } from "@/features/auth/session";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * The phase that delivers this screen. Present means not built yet: the
   * route resolves to a "coming soon" state instead of a broken link, which
   * is what the brief asks for.
   */
  phase?: number;
  /**
   * Which roles see this item. Omitted means administrators only, which is
   * what every /admin entry meant before the narrower clinic-side roles
   * existed — so an item added without thinking about them stays hidden
   * rather than silently appearing in a receptionist's menu.
   *
   * Hiding an item is a courtesy, not a control: the page behind it guards
   * itself with requireRole, and row level security decides what any of them
   * can actually read.
   */
  roles?: RoleSlug[];
  /**
   * The permission that reveals this item to a role the practice defined
   * itself. `roles` still reveals it to the built-ins, so the two together
   * read as "an administrator, or anyone their practice gave this to".
   *
   * Hiding an item is a courtesy either way: the page behind it guards itself,
   * and row level security decides what any of them can actually read.
   */
  permission?: string;
};

const ADMINS: RoleSlug[] = ["admin", "super_admin"];

/**
 * Stands for "holds any permission at all" — the dashboard, which everyone
 * with a desk in this area sees whatever their role is called.
 */
export const ANY_DESK = "*";

/** Navigation per CLAUDE.md §8. Order is the order it appears. */

export const CLIENT_NAV: NavItem[] = [
  { label: "Home", href: "/client", icon: Home },
  { label: "My Pets", href: "/client/pets", icon: PawPrint },
  { label: "Appointments", href: "/client/appointments", icon: CalendarDays },
  { label: "Medical Records", href: "/client/records", icon: ClipboardList },
  { label: "Prescriptions", href: "/client/prescriptions", icon: FileText },
  { label: "Vaccinations", href: "/client/vaccinations", icon: Syringe },
  { label: "Deworming", href: "/client/deworming", icon: Worm },
  { label: "Invoices", href: "/client/invoices", icon: Receipt },
  { label: "Notifications", href: "/client/notifications", icon: Bell },
  { label: "Profile", href: "/client/profile", icon: UserCog },
];

export const DOCTOR_NAV: NavItem[] = [
  { label: "Dashboard", href: "/doctor", icon: LayoutDashboard },
  { label: "Appointments", href: "/doctor/appointments", icon: CalendarDays },
  { label: "Patients", href: "/doctor/patients", icon: PawPrint },
  { label: "Calendar", href: "/doctor/calendar", icon: CalendarDays },
  { label: "SOAP", href: "/doctor/soap", icon: ClipboardList },
  { label: "Prescriptions", href: "/doctor/prescriptions", icon: FileText },
  { label: "Vaccinations", href: "/doctor/vaccinations", icon: Syringe },
  { label: "Deworming", href: "/doctor/deworming", icon: Worm },
  { label: "Diagnostics", href: "/doctor/diagnostics", icon: FlaskConical },
  { label: "Follow-ups", href: "/doctor/follow-ups", icon: Stethoscope },
  // Not in CLAUDE.md §8's literal list — added because §8.6 explicitly
  // anticipates a permitted doctor reaching reports, and unlike billing
  // (reached from an appointment) reports have no natural entry point
  // otherwise. The page itself still gates on can_view_reports.
  { label: "Reports", href: "/doctor/reports", icon: FileText },
];

/**
 * One menu, filtered per role — see navFor(). Administrators see all of it;
 * the three narrower roles see the slice their own work needs, matching the
 * policies in 20260917000100_staff_roles.sql.
 */
export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, roles: [...ADMINS, "finance_manager", "lab", "receptionist"], permission: ANY_DESK },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarDays, roles: [...ADMINS, "receptionist"], permission: "appointments.view" },
  { label: "Clients", href: "/admin/clients", icon: Users, permission: "clients.view" },
  { label: "Patients", href: "/admin/patients", icon: PawPrint, permission: "patients.view" },
  { label: "Doctors", href: "/admin/doctors", icon: Stethoscope, roles: [...ADMINS, "receptionist"], permission: "doctors.view" },
  { label: "Services", href: "/admin/services", icon: ClipboardList, roles: [...ADMINS, "receptionist"], permission: "services.view" },
  { label: "Lab", href: "/admin/lab", icon: FlaskConical, roles: [...ADMINS, "lab"], permission: "clinical.view" },
  { label: "Billing", href: "/admin/billing", icon: CreditCard, roles: [...ADMINS, "finance_manager"], permission: "billing.view" },
  { label: "Payments", href: "/admin/payments", icon: Wallet, roles: [...ADMINS, "finance_manager"], permission: "billing.view" },
  { label: "Vaccinations", href: "/admin/vaccinations", icon: Syringe, roles: [...ADMINS, "receptionist"], permission: "preventive.view" },
  { label: "Deworming", href: "/admin/deworming", icon: Worm, roles: [...ADMINS, "receptionist"], permission: "preventive.view" },
  { label: "Reports", href: "/admin/reports", icon: FileText, roles: [...ADMINS, "finance_manager"], permission: "reports.view" },
  { label: "Notifications", href: "/admin/notifications", icon: Bell, roles: [...ADMINS, "receptionist"], permission: "notifications.view" },
  { label: "Messages", href: "/admin/messages", icon: MessageSquare, roles: [...ADMINS, "receptionist"], permission: "notifications.view" },
  // No `permission`: granting roles and editing what a role may do is
  // administrator work and deliberately cannot be delegated through the
  // matrix — see ROLE_ADMINISTRATION_IS_ADMIN_ONLY in the catalogue.
  { label: "Users & roles", href: "/admin/users", icon: UserCog },
  { label: "Data", href: "/admin/data", icon: Database, permission: "data.view" },
  { label: "Website", href: "/admin/website", icon: Globe, permission: "website.view" },
  { label: "Settings", href: "/admin/settings", icon: Settings, permission: "settings.view" },
];

export type Area = {
  key: "client" | "doctor" | "admin";
  label: string;
  href: string;
  nav: NavItem[];
  /** Roles allowed into this area. */
  roles: RoleSlug[];
  icon: LucideIcon;
};

export const AREAS: Record<Area["key"], Area> = {
  client: {
    key: "client",
    label: "My account",
    href: "/client",
    nav: CLIENT_NAV,
    roles: ["client"],
    icon: UserRound,
  },
  doctor: {
    key: "doctor",
    label: "Clinical",
    href: "/doctor",
    nav: DOCTOR_NAV,
    roles: ["doctor"],
    icon: Stethoscope,
  },
  admin: {
    key: "admin",
    label: "Administration",
    href: "/admin",
    nav: ADMIN_NAV,
    // super_admin is architecture only; it is not given its own area yet. The
    // three narrower roles share this area and are filtered by navFor().
    roles: ["admin", "super_admin", "finance_manager", "lab", "receptionist"],
    icon: Shield,
  },
};

/**
 * The items this person may see in an area. An item with no `roles` is
 * administrators-only; anything else lists the roles it belongs to.
 */
export function navFor(area: Area["key"], roles: RoleSlug[], permissions: string[] = []): NavItem[] {
  return AREAS[area].nav.filter((item) => {
    if ((item.roles ?? ADMINS).some((role) => roles.includes(role))) return true;
    if (!item.permission) return false;

    return item.permission === ANY_DESK
      ? permissions.length > 0
      : permissions.includes(item.permission);
  });
}

/** Looks up a navigation item by exact path, for the coming-soon fallback. */
export function findNavItem(area: Area["key"], pathname: string): NavItem | undefined {
  return AREAS[area].nav.find((item) => item.href === pathname);
}

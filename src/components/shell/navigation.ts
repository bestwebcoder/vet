import {
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
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
};

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

export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarDays },
  { label: "Clients", href: "/admin/clients", icon: Users },
  { label: "Patients", href: "/admin/patients", icon: PawPrint },
  { label: "Doctors", href: "/admin/doctors", icon: Stethoscope },
  { label: "Services", href: "/admin/services", icon: ClipboardList },
  { label: "Billing", href: "/admin/billing", icon: CreditCard },
  { label: "Payments", href: "/admin/payments", icon: Wallet },
  { label: "Vaccinations", href: "/admin/vaccinations", icon: Syringe },
  { label: "Deworming", href: "/admin/deworming", icon: Worm },
  { label: "Reports", href: "/admin/reports", icon: FileText },
  { label: "Notifications", href: "/admin/notifications", icon: Bell },
  { label: "Messages", href: "/admin/messages", icon: MessageSquare },
  { label: "Team", href: "/admin/team", icon: UserCog },
  { label: "Website", href: "/admin/website", icon: Globe },
  { label: "Settings", href: "/admin/settings", icon: Settings },
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
    // super_admin is architecture only; it is not given its own area yet.
    roles: ["admin", "super_admin"],
    icon: Shield,
  },
};

/** Looks up a navigation item by exact path, for the coming-soon fallback. */
export function findNavItem(area: Area["key"], pathname: string): NavItem | undefined {
  return AREAS[area].nav.find((item) => item.href === pathname);
}

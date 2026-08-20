import {
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  Home,
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
  { label: "Appointments", href: "/client/appointments", icon: CalendarDays, phase: 3 },
  { label: "Medical Records", href: "/client/records", icon: ClipboardList, phase: 4 },
  { label: "Prescriptions", href: "/client/prescriptions", icon: FileText, phase: 5 },
  { label: "Vaccinations", href: "/client/vaccinations", icon: Syringe, phase: 6 },
  { label: "Deworming", href: "/client/deworming", icon: Worm, phase: 6 },
  { label: "Invoices", href: "/client/invoices", icon: Receipt, phase: 7 },
  { label: "Notifications", href: "/client/notifications", icon: Bell, phase: 9 },
  { label: "Profile", href: "/client/profile", icon: UserCog },
];

export const DOCTOR_NAV: NavItem[] = [
  { label: "Dashboard", href: "/doctor", icon: LayoutDashboard },
  { label: "Appointments", href: "/doctor/appointments", icon: CalendarDays, phase: 3 },
  { label: "Patients", href: "/doctor/patients", icon: PawPrint },
  { label: "Calendar", href: "/doctor/calendar", icon: CalendarDays, phase: 3 },
  { label: "SOAP", href: "/doctor/soap", icon: ClipboardList, phase: 4 },
  { label: "Prescriptions", href: "/doctor/prescriptions", icon: FileText, phase: 5 },
  { label: "Vaccinations", href: "/doctor/vaccinations", icon: Syringe, phase: 6 },
  { label: "Deworming", href: "/doctor/deworming", icon: Worm, phase: 6 },
  { label: "Diagnostics", href: "/doctor/diagnostics", icon: FlaskConical, phase: 4 },
  { label: "Follow-ups", href: "/doctor/follow-ups", icon: Stethoscope, phase: 4 },
];

export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarDays, phase: 3 },
  { label: "Clients", href: "/admin/clients", icon: Users },
  { label: "Patients", href: "/admin/patients", icon: PawPrint },
  // Not in any earlier phase's scope: managing doctors appears only in the
  // admin workflow of CLAUDE.md §12, which Phase 10 must satisfy.
  { label: "Doctors", href: "/admin/doctors", icon: Stethoscope, phase: 10 },
  { label: "Services", href: "/admin/services", icon: ClipboardList, phase: 7 },
  { label: "Billing", href: "/admin/billing", icon: CreditCard, phase: 7 },
  { label: "Payments", href: "/admin/payments", icon: Wallet, phase: 7 },
  { label: "Vaccinations", href: "/admin/vaccinations", icon: Syringe, phase: 6 },
  { label: "Deworming", href: "/admin/deworming", icon: Worm, phase: 6 },
  { label: "Reports", href: "/admin/reports", icon: FileText, phase: 8 },
  { label: "Notifications", href: "/admin/notifications", icon: Bell, phase: 9 },
  { label: "Settings", href: "/admin/settings", icon: Settings, phase: 10 },
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

import {
  Award,
  Bell,
  Building2,
  Clock,
  FileText,
  GraduationCap,
  Heart,
  HeartHandshake,
  Home,
  MapPin,
  PawPrint,
  Phone,
  Receipt,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * A curated allowlist, not free-text icon names — admin picks from this
 * list, so a typo can never end up stored and silently render nothing.
 * Keys are stored in home_section_items.icon; add an entry here to make a
 * new icon available, no migration needed.
 */
export const ICON_OPTIONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "stethoscope", label: "Stethoscope", icon: Stethoscope },
  { key: "home", label: "Home", icon: Home },
  { key: "syringe", label: "Syringe", icon: Syringe },
  { key: "file-text", label: "Document", icon: FileText },
  { key: "paw-print", label: "Paw print", icon: PawPrint },
  { key: "bell", label: "Bell", icon: Bell },
  { key: "receipt", label: "Receipt", icon: Receipt },
  { key: "shield-check", label: "Shield", icon: ShieldCheck },
  { key: "heart", label: "Heart", icon: Heart },
  { key: "clock", label: "Clock", icon: Clock },
  { key: "users", label: "People", icon: Users },
  { key: "sparkles", label: "Sparkles", icon: Sparkles },
  { key: "award", label: "Award", icon: Award },
  { key: "map-pin", label: "Location", icon: MapPin },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "graduation-cap", label: "Training", icon: GraduationCap },
  { key: "building", label: "Clinic building", icon: Building2 },
  { key: "heart-handshake", label: "Community", icon: HeartHandshake },
];

export const ICON_KEYS = ICON_OPTIONS.map((option) => option.key) as [string, ...string[]];

export function iconByKey(key: string | null | undefined): LucideIcon | null {
  if (!key) return null;
  return ICON_OPTIONS.find((option) => option.key === key)?.icon ?? null;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AREAS, type Area } from "@/components/shell/navigation";
import { cn } from "@/lib/utils";

/**
 * The navigation list, shared by the desktop sidebar and the mobile drawer so
 * the two cannot drift apart.
 *
 * Takes the area key rather than the items themselves: navigation entries
 * carry icon components, and a function cannot be passed from a server
 * component to a client one. Reading the config here keeps it client-side.
 */
export function NavLinks({
  areaKey,
  onNavigate,
}: {
  areaKey: Area["key"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = AREAS[areaKey].nav;

  return (
    <nav className="grid gap-1" aria-label="Main">
      {items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              // 44px tall: this is the primary target on a phone.
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              isActive
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.phase ? (
              <span className="text-muted-foreground/70 text-xs" title="Not built yet">
                Soon
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

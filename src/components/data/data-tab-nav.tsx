"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DATA_TABS, dataTabHref } from "@/components/data/data-tabs";
import { cn } from "@/lib/utils";

/**
 * A horizontally scrolling strip, so five sections still work on a phone.
 * Mirrors PetTabNav rather than inventing a second tab style.
 */
export function DataTabNav() {
  const pathname = usePathname();

  return (
    // min-w-0: as a grid child this defaults to min-width:auto, so without it
    // the strip refuses to shrink and scrolls the whole page sideways.
    <div className="min-w-0 border-b">
      <nav
        aria-label="Data and backups"
        className="-mb-px flex gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {DATA_TABS.map((tab) => {
          const href = dataTabHref(tab.slug);
          const isActive = pathname === href;

          return (
            <Link
              key={tab.slug || "backup"}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                "focus-visible:ring-ring rounded-t-md focus-visible:ring-2 focus-visible:outline-none",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

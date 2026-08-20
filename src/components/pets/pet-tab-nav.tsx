"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PET_TABS, petTabHref } from "@/components/pets/pet-tabs";
import { cn } from "@/lib/utils";

/**
 * A horizontally scrolling tab strip. Nine tabs cannot fit on a phone, so it
 * scrolls rather than wrapping into a block that pushes the record off screen.
 */
export function PetTabNav({ basePath }: { basePath: string }) {
  const pathname = usePathname();

  return (
    // min-w-0 matters: as a grid child this container defaults to
    // min-width:auto, so without it the strip refuses to shrink below its
    // content and scrolls the whole page sideways instead of scrolling itself.
    <div className="min-w-0 border-b">
      <nav
        aria-label="Patient record"
        className="-mb-px flex gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {PET_TABS.map((tab) => {
          const href = petTabHref(basePath, tab.slug);
          const isActive = pathname === href;

          return (
            <Link
              key={tab.slug || "overview"}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                "focus-visible:ring-ring rounded-t-md focus-visible:ring-2 focus-visible:outline-none",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
              {tab.phase ? (
                <span className="text-muted-foreground/70 text-xs">Soon</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

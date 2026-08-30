import Link from "next/link";

import { ROSTER_TABS, type RosterCounts, type RosterTab } from "@/features/team/queries";
import { cn } from "@/lib/utils";

export const ROSTER_TAB_LABELS: Record<RosterTab, string> = {
  all: "All",
  admin: "Admins",
  doctor: "Doctors",
  client: "Clients",
  finance_manager: "Finance",
  lab: "Lab",
  receptionist: "Reception",
  custom: "Custom roles",
  none: "No role",
};

/**
 * The role filter, as links rather than client state — the same reasoning as
 * Pagination: which tab you are on belongs in the URL, so a page of Doctors
 * can be bookmarked, shared and reached before JavaScript loads. It also lets
 * the server fetch only that tab instead of every user in the practice.
 *
 * Selecting a tab drops the page number: page 4 of Admins is rarely the page
 * you want when you switch to Clients.
 */
export function RosterTabs({ active, counts }: { active: RosterTab; counts: RosterCounts | null }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Filter by role">
      {ROSTER_TABS.map((tab) => {
        const isActive = tab === active;
        const count = counts?.[tab];

        return (
          <Link
            key={tab}
            href={tab === "all" ? "/admin/users" : `/admin/users?role=${tab}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {ROSTER_TAB_LABELS[tab]}
            {count === undefined ? null : (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  isActive ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { RolesPanel } from "@/components/roles/roles-panel";
import { AddTeamMemberDialog } from "@/components/team/add-team-member-dialog";
import { RemovedTeamMembers } from "@/components/team/removed-team-members";
import { RosterTabs, ROSTER_TAB_LABELS } from "@/components/team/roster-tabs";
import { TeamRosterTable } from "@/components/team/team-roster-table";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listRoles } from "@/features/roles/queries";
import { getRemovedTeamMembers, getRosterCounts, getTeamRoster, isRosterTab } from "@/features/team/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Users & roles · TV Care" };

const SECTIONS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles & permissions" },
] as const;

type Section = (typeof SECTIONS)[number]["key"];

/**
 * Everyone with a login into the practice, and the roles they can hold.
 *
 * One screen for both halves: a role is only ever created in order to give it
 * to somebody, and sending an administrator between two pages to finish one
 * thought is how the two drift out of step in their head.
 *
 * Administrators only — and that is enforced here, not by the menu: the /admin
 * area admits the narrower clinic-side roles too, so a receptionist who typed
 * this URL would otherwise arrive. Editing roles is deliberately not something
 * the permission matrix can grant, since a permission to edit permissions is a
 * permission to grant yourself all of them.
 */
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  const { page: pageParam, role: roleParam, section: sectionParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;
  const tab = typeof roleParam === "string" && isRosterTab(roleParam) ? roleParam : "all";
  const section: Section = sectionParam === "roles" ? "roles" : "users";

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Users &amp; roles</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const [roster, counts, removed, roles] = await Promise.all([
    getTeamRoster(organizationId, { page, tab }),
    getRosterCounts(organizationId),
    getRemovedTeamMembers(organizationId),
    listRoles(organizationId),
  ]);

  // The select on each roster row and the Add user dialog offer the same list:
  // every role this practice can assign, its own included.
  const roleOptions =
    roles.status === "ok" ? roles.data.map((role) => ({ value: role.id, label: role.name })) : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1>Users &amp; roles</h1>
          <p className="text-muted-foreground">
            Everyone with a login into the practice, and what each role may do. Doctors and clients keep their own
            pages for everything else about them.
          </p>
        </div>

        {section === "users" ? <AddTeamMemberDialog roles={roleOptions} /> : null}
      </div>

      <nav className="flex flex-wrap gap-1" aria-label="Section">
        {SECTIONS.map((entry) => (
          <Link
            key={entry.key}
            href={entry.key === "users" ? "/admin/users" : "/admin/users?section=roles"}
            aria-current={entry.key === section ? "page" : undefined}
            className={cn(
              "flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors",
              entry.key === section
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {section === "roles" ? (
        <Card>
          <CardContent>
            {roles.status === "error" ? (
              <ErrorState title="Roles could not be loaded" />
            ) : (
              <RolesPanel roles={roles.data} />
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4">
              <RosterTabs active={tab} counts={counts.status === "ok" ? counts.data : null} />

              {roster.status === "error" ? (
                <ErrorState title="Users could not be loaded" />
              ) : roster.data.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={tab === "all" ? "No users yet" : `No ${ROSTER_TAB_LABELS[tab].toLowerCase()} yet`}
                  description={
                    tab === "none"
                      ? "Everyone registered in this practice has a role."
                      : "Use Add user to add someone and give them a role."
                  }
                />
              ) : (
                <>
                  <TeamRosterTable members={roster.data} roles={roleOptions} />
                  <Pagination
                    basePath="/admin/users"
                    searchParams={{ role: tab === "all" ? undefined : tab }}
                    page={roster.page}
                    pageSize={roster.pageSize}
                    totalCount={roster.totalCount}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {removed.status === "ok" && removed.data.length > 0 ? (
            <Card>
              <CardContent>
                <RemovedTeamMembers members={removed.data} />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

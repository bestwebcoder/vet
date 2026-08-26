import type { Metadata } from "next";

import { InviteTeamMemberDialog } from "@/components/team/invite-team-member-dialog";
import { RemovedTeamMembers } from "@/components/team/removed-team-members";
import { RosterTabs, ROSTER_TAB_LABELS } from "@/components/team/roster-tabs";
import { TeamRosterTable } from "@/components/team/team-roster-table";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getRemovedTeamMembers, getRosterCounts, getTeamRoster, isRosterTab } from "@/features/team/queries";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Users · TV Care" };

/**
 * Everyone with a login into the practice, filtered by role.
 *
 * Administrators only — and that is enforced here, not by the menu: the /admin
 * area now admits the narrower clinic-side roles too, so a receptionist who
 * typed this URL would otherwise arrive. The nav item declares no `roles` at
 * all, which navFor() reads as administrators-only (see
 * src/components/shell/navigation.ts), so nobody else is shown it either.
 */
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  const { page: pageParam, role: roleParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;
  const tab = typeof roleParam === "string" && isRosterTab(roleParam) ? roleParam : "all";

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Users &amp; roles</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const [roster, counts, removed] = await Promise.all([
    getTeamRoster(organizationId, { page, tab }),
    getRosterCounts(organizationId),
    getRemovedTeamMembers(organizationId),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1>Users &amp; roles</h1>
          <p className="text-muted-foreground">
            Everyone with a login into the practice. Add someone, or change what they can reach by changing their
            role — doctors and clients keep their own pages for everything else about them.
          </p>
        </div>

        <InviteTeamMemberDialog />
      </div>

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
                  : "Use Add user to invite someone and give them a role."
              }
            />
          ) : (
            <>
              <TeamRosterTable members={roster.data} />
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
    </div>
  );
}

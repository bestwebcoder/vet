import type { Metadata } from "next";

import { InviteTeamMemberDialog } from "@/components/team/invite-team-member-dialog";
import { RemovedTeamMembers } from "@/components/team/removed-team-members";
import { TeamRosterTable } from "@/components/team/team-roster-table";
import { Pagination } from "@/components/search/pagination";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getRemovedTeamMembers, getTeamRoster } from "@/features/team/queries";

export const metadata: Metadata = { title: "Users · TV Care" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Users & roles</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const [team, removed] = await Promise.all([
    getTeamRoster(organizationId, { page }),
    getRemovedTeamMembers(organizationId),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1>Users & roles</h1>
          <p className="text-muted-foreground">
            Everyone with a login into the practice&rsquo;s administration, and anyone registered as staff waiting
            to be granted a role. Doctors and clients are managed from their own pages.
          </p>
        </div>

        <InviteTeamMemberDialog />
      </div>

      {team.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Users could not be loaded" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-4">
            <TeamRosterTable members={team.data} />
            <Pagination
              basePath="/admin/users"
              searchParams={{}}
              page={team.page}
              pageSize={team.pageSize}
              totalCount={team.totalCount}
            />
          </CardContent>
        </Card>
      )}

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

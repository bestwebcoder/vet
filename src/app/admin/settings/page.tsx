import type { Metadata } from "next";

import { HeroImageForm } from "@/components/organizations/hero-image-form";
import { SettingsForm } from "@/components/organizations/settings-form";
import { SiteContentForm } from "@/components/organizations/site-content-form";
import { TeamRolesForm } from "@/components/organizations/team-roles-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnOrganization } from "@/features/organizations/queries";
import { getSiteContentForAdmin } from "@/features/site-content/queries";
import { getTeamRoster } from "@/features/team/queries";

export const metadata: Metadata = { title: "Settings · TV Care" };

export default async function AdminSettingsPage() {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Settings</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const [organization, siteContent, team] = await Promise.all([
    getOwnOrganization(organizationId),
    getSiteContentForAdmin(organizationId),
    getTeamRoster(organizationId),
  ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Settings</h1>
        <p className="text-muted-foreground">Practice identity shown on documents, emails and the client-facing app.</p>
      </div>

      {organization.status === "error" || !organization.data ? (
        <Card>
          <CardContent>
            <ErrorState title="Settings could not be loaded" />
          </CardContent>
        </Card>
      ) : (
        <>
          <SettingsForm organization={organization.data} />
          <HeroImageForm heroImageUrl={organization.data.heroImageUrl} />
          {team.status === "ok" ? (
            <TeamRolesForm members={team.data} />
          ) : (
            <Card>
              <CardContent>
                <ErrorState title="Team could not be loaded" />
              </CardContent>
            </Card>
          )}
          {siteContent.status === "ok" ? (
            <SiteContentForm content={siteContent.data} practiceName={organization.data.name} />
          ) : (
            <Card>
              <CardContent>
                <ErrorState title="Website content could not be loaded" />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

import type { Metadata } from "next";

import { SiteContentEditor } from "@/components/organizations/site-content-editor";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnOrganization } from "@/features/organizations/queries";
import { getSiteContentForAdmin } from "@/features/site-content/queries";

export const metadata: Metadata = { title: "Website · TV Care" };

export default async function AdminWebsitePage() {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Website</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const [organization, siteContent] = await Promise.all([
    getOwnOrganization(organizationId),
    getSiteContentForAdmin(organizationId),
  ]);

  const practiceName = organization.status === "ok" ? (organization.data?.name ?? "The Traveling Vet") : "The Traveling Vet";

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Website</h1>
        <p className="text-muted-foreground">The headline and body text shown on the public marketing site.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Public website content</CardTitle>
          <CardDescription>
            Pick a page on the left, edit its text on the right. Leave a field blank to use its default text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {siteContent.status === "ok" ? (
            <SiteContentEditor content={siteContent.data} practiceName={practiceName} />
          ) : (
            <ErrorState title="Website content could not be loaded" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

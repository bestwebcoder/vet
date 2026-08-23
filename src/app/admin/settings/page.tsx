import type { Metadata } from "next";

import { SettingsForm } from "@/components/organizations/settings-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnOrganization } from "@/features/organizations/queries";

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

  const organization = await getOwnOrganization(organizationId);

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
        <SettingsForm organization={organization.data} />
      )}
    </div>
  );
}

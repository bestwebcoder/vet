import type { Metadata } from "next";

import { HeroImageForm } from "@/components/organizations/hero-image-form";
import { LogoImageForm } from "@/components/organizations/logo-image-form";
import { SettingsForm } from "@/components/organizations/settings-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOrganizationHeroImages, getOwnOrganization } from "@/features/organizations/queries";

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

  const [organization, heroImages] = await Promise.all([
    getOwnOrganization(organizationId),
    getOrganizationHeroImages(organizationId),
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
          <LogoImageForm logoUrl={organization.data.logoUrl} footerShowLogo={organization.data.footerShowLogo} />
          <HeroImageForm heroImages={heroImages.status === "ok" ? heroImages.data : []} />
        </>
      )}
    </div>
  );
}

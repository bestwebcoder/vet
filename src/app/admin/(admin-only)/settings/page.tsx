import { Database } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BranchManager } from "@/components/branches/branch-manager";
import { HeroImageForm } from "@/components/organizations/hero-image-form";
import { LogoImageForm } from "@/components/organizations/logo-image-form";
import { SettingsForm } from "@/components/organizations/settings-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listBranchesForAdmin } from "@/features/branches/queries";
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

  const [organization, heroImages, branches] = await Promise.all([
    getOwnOrganization(organizationId),
    getOrganizationHeroImages(organizationId),
    listBranchesForAdmin(organizationId),
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
          <BranchManager branches={branches.status === "ok" ? branches.data : []} />
          <LogoImageForm logoUrl={organization.data.logoUrl} footerShowLogo={organization.data.footerShowLogo} />
          <HeroImageForm heroImages={heroImages.status === "ok" ? heroImages.data : []} />

          {/* Backups are their own screen — too much for a settings card — but
              this is where an administrator comes looking for them. */}
          <Card>
            <CardHeader>
              <CardTitle>Data and backups</CardTitle>
              <CardDescription>
                Download a copy of everything this practice holds, import clients and services from a spreadsheet,
                recover a deleted record, or read the audit log.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/admin/data"
                className="text-primary inline-flex min-h-11 items-center gap-2 text-sm hover:underline"
              >
                <Database className="size-4" aria-hidden />
                Open Data
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

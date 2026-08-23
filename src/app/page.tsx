import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FrontPage } from "@/components/marketing/front-page";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { getPublicLeadDoctor } from "@/features/doctors/queries";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { getSessionUser, homeHrefFor } from "@/features/auth/session";

export const metadata: Metadata = { title: "TV Care" };

/**
 * Signed in: sends each person to their own area (someone holding several
 * roles lands on the most privileged one; the others stay reachable by
 * URL). Signed out: the public front page, not a login redirect.
 */
export default async function RootPage() {
  const user = await getSessionUser();

  if (!user) {
    const [organization, leadDoctor] = await Promise.all([getPublicOrganizationInfo(), getPublicLeadDoctor()]);
    return <FrontPage organization={organization} leadDoctor={leadDoctor} />;
  }

  const home = homeHrefFor(user);

  if (home) {
    redirect(home);
  }

  // A real state, not an error: an administrator can create an account before
  // deciding what it is for.
  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="grid gap-4">
          <EmptyState
            title="Your account is not set up yet"
            description="No role has been assigned to this account. An administrator at your clinic needs to grant access before you can use TV Care."
          />
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="touch" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

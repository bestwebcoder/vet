import type { Metadata } from "next";

import { FrontPage } from "@/components/marketing/front-page";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { getPublicDoctors } from "@/features/doctors/queries";
import { getPublicPageSectionItems } from "@/features/page-sections/queries";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { getPublicSiteContent } from "@/features/site-content/queries";
import { getSessionUser, homeHrefFor } from "@/features/auth/session";

export const metadata: Metadata = { title: "TV Care" };

/**
 * The public front page — for everyone, signed in or not. Signing in only
 * changes the sign-up/sign-in CTAs into a link back to your own dashboard
 * (see PublicHeader and FrontPage's homeHref prop); it never redirects you
 * away, so an admin, doctor or client can still browse the site they're
 * running while logged in. loginAction/registerAction send you straight to
 * your dashboard on the way in, so this only matters when you navigate
 * *back* to "/" afterward.
 */
export default async function RootPage() {
  const user = await getSessionUser();
  const home = user ? homeHrefFor(user) : null;

  if (!user || home) {
    const [organization, doctorsResult] = await Promise.all([getPublicOrganizationInfo(), getPublicDoctors()]);
    const [content, homeSections] = await Promise.all([
      organization ? getPublicSiteContent(organization.id) : Promise.resolve({}),
      organization
        ? getPublicPageSectionItems(organization.id, "home")
        : Promise.resolve({ services: [], why: [], how_it_works: [] }),
    ]);
    const doctors = doctorsResult.status === "ok" ? doctorsResult.data : [];
    const leadDoctor = doctors.find((doctor) => doctor.isLeadDoctor) ?? null;
    return (
      <FrontPage
        organization={organization}
        leadDoctor={leadDoctor}
        doctors={doctors}
        content={content}
        homeSections={homeSections}
        homeHref={home}
      />
    );
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

import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";

import { GoldRule, MarketingBand } from "@/components/marketing/marketing-band";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { ServiceCategorySection } from "@/components/marketing/service-category-section";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { bookingHrefForVisitor } from "@/features/auth/session";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { getPublicServices } from "@/features/services/queries";
import { siteContentValue } from "@/features/site-content/fields";
import { getPublicSiteContent } from "@/features/site-content/queries";
import { categoriesFor, intoCategories } from "@/lib/service-pages";

export const metadata: Metadata = { title: "Training & Education · TV Care" };

/** The route this page owns, and the key its categories are matched on. */
const HREF = "/training-education";

/**
 * The public training and education page.
 *
 * The same cards as the services catalogue, on a page of their own: teaching
 * work is bought by a clinic for its staff or by a university for its
 * students, not booked for a pet, and it read as an afterthought at the bottom
 * of a price list. src/lib/service-pages.ts decides which categories land here,
 * and /services skips exactly those — so nothing appears twice and nothing
 * falls between the two pages.
 *
 * Everything on it is database-driven, like /services: the programmes, their
 * topics and their fees come from Admin → Services, and the hero and closing
 * call to action from Admin → Website. Advisory accenting throughout — gold
 * rules and a two-column grid, because these cards carry long topic lists and
 * often no figure.
 */
export default async function TrainingEducationPage() {
  const organization = await getPublicOrganizationInfo();

  // No practice resolved means nothing to show — never everything.
  const servicesResult = organization
    ? await getPublicServices(organization.id)
    : { status: "ok" as const, data: [] };

  const practiceName = organization?.name ?? "The Traveling Vet";
  const [content, bookingHref] = await Promise.all([
    organization ? getPublicSiteContent(organization.id) : Promise.resolve({}),
    bookingHrefForVisitor(),
  ]);

  const categories = servicesResult.status === "ok" ? categoriesFor(intoCategories(servicesResult.data), HREF) : [];

  // The practice's own words for this work, when it has not written a separate
  // hero introduction — saying it twice in different words is worse than once.
  const intro = siteContentValue(content, "training.intro", practiceName) || categories[0]?.description || undefined;

  return (
    <div className="bg-marketing-parchment flex min-h-svh flex-col">
      <PublicHeader
        practiceName={practiceName}
        logoUrl={organization?.logoUrl ?? null}
        organizationId={organization?.id ?? null}
      />

      <main className="flex-1">
        <MarketingBand
          eyebrow={siteContentValue(content, "training.hero_eyebrow", practiceName)}
          title={siteContentValue(content, "training.hero_title", practiceName)}
          italicTitle={siteContentValue(content, "training.hero_title_italic", practiceName)}
          subtitle={intro}
          action={{
            label: siteContentValue(content, "training.hero_cta", practiceName),
            href: "/contact",
          }}
        />
        <GoldRule />

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-14">
          {servicesResult.status === "error" ? (
            <div className="py-20">
              <ErrorState title="Programmes could not be loaded" />
            </div>
          ) : categories.length === 0 ? (
            <div className="py-20">
              <EmptyState
                icon={GraduationCap}
                title="No programmes listed yet"
                description="Check back soon — our training and education programmes will appear here once they're set up."
              />
            </div>
          ) : (
            categories.map((category) => (
              <ServiceCategorySection
                key={category.key}
                name={category.name}
                // Already the hero's introduction when the practice hasn't
                // written one — printed twice on one page it reads as a fault.
                description={category.description === intro ? null : category.description}
                icon={category.icon}
                services={category.services}
                bookingHref={bookingHref}
                accent="gold"
                wide
              />
            ))
          )}
        </div>

        <MarketingBand
          size="closing"
          title={siteContentValue(content, "training.cta_title", practiceName)}
          subtitle={siteContentValue(content, "training.cta_subtitle", practiceName)}
          action={{ label: siteContentValue(content, "training.cta_button", practiceName), href: "/contact" }}
        />
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}

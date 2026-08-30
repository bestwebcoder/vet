import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

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
import { categoriesForCatalogue, intoCategories, isAdvisoryCategory } from "@/lib/service-pages";

export const metadata: Metadata = { title: "Our Services · TV Care" };

/**
 * The public services page.
 *
 * Laid out by category rather than as one paged grid: a practice's catalogue
 * divides into the kinds of work it does — home care, community work,
 * consulting — and each of those wants its own heading, its own
 * blurb, and cards that carry what is included and what it costs.
 *
 * Everything on it is database-driven. The categories, their descriptions and
 * icons, every service, its tagline, its inclusions and its fee all come from
 * Admin → Services; the headline, intro and closing call to action come from
 * Admin → Website. Nothing about this practice is written into this file —
 * which is CLAUDE.md §9.3–9.7, and also the only way the page survives a
 * price change.
 *
 * Categories a practice marks as advisory work get the gold accent and a
 * two-column grid, because those cards carry longer lists and no figures.
 * Teaching work leaves this page entirely — it has one of its own, and which
 * categories those are is decided in src/lib/service-pages.ts.
 */

export default async function ServicesPage() {
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

  const categories =
    servicesResult.status === "ok" ? categoriesForCatalogue(intoCategories(servicesResult.data)) : [];

  return (
    <div className="bg-marketing-parchment flex min-h-svh flex-col">
      <PublicHeader
        practiceName={practiceName}
        logoUrl={organization?.logoUrl ?? null}
        organizationId={organization?.id ?? null}
      />

      <main className="flex-1">
        <MarketingBand
          eyebrow={siteContentValue(content, "services.hero_eyebrow", practiceName)}
          title={siteContentValue(content, "services.hero_title", practiceName)}
          italicTitle={siteContentValue(content, "services.hero_title_italic", practiceName)}
          subtitle={siteContentValue(content, "services.intro", practiceName)}
          action={{
            label: siteContentValue(content, "services.hero_cta", practiceName),
            href: "/contact",
          }}
        />
        <GoldRule />

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-14">
          {servicesResult.status === "error" ? (
            <div className="py-20">
              <ErrorState title="Services could not be loaded" />
            </div>
          ) : categories.length === 0 ? (
            <div className="py-20">
              <EmptyState
                icon={ClipboardList}
                title="No services listed yet"
                description="Check back soon — our services will appear here once they're set up."
              />
            </div>
          ) : (
            categories.map((category) => (
              <ServiceCategorySection
                key={category.key}
                name={category.name}
                description={category.description}
                icon={category.icon}
                services={category.services}
                bookingHref={bookingHref}
                accent={isAdvisoryCategory(category.name) ? "gold" : "grove"}
                wide={isAdvisoryCategory(category.name)}
              />
            ))
          )}
        </div>

        <MarketingBand
          size="closing"
          title={siteContentValue(content, "services.cta_title", practiceName)}
          subtitle={siteContentValue(content, "services.cta_subtitle", practiceName)}
          action={{ label: siteContentValue(content, "services.cta_button", practiceName), href: "/contact" }}
        />
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}

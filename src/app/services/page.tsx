import type { Metadata } from "next";
import { ClipboardList, Home } from "lucide-react";

import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCards } from "@/components/marketing/section-cards";
import { Pagination } from "@/components/search/pagination";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { getPublicPageSectionItems, type PageSectionItems } from "@/features/page-sections/queries";
import { getPublicServices, type ServiceSummary } from "@/features/services/queries";
import { siteContentValue } from "@/features/site-content/fields";
import { getPublicSiteContent } from "@/features/site-content/queries";

export const metadata: Metadata = { title: "Services · TV Care" };

/** Three per row on a wide screen, four rows deep. */
const PAGE_SIZE = 12;

/**
 * Sorted so a page can be cut anywhere and still read as grouped: category
 * first, then the practice's own sort_order within it, which is the order the
 * query already returns and the order an admin arranged on the Services screen.
 */
function byCategoryThenOrder(a: ServiceSummary, b: ServiceSummary) {
  const groupA = a.categoryName ?? "Other";
  const groupB = b.categoryName ?? "Other";

  // "Other" last: it is where anything uncategorised falls, not a heading the
  // practice chose.
  if (groupA !== groupB) {
    if (groupA === "Other") return 1;
    if (groupB === "Other") return -1;
    return groupA.localeCompare(groupB);
  }

  return 0;
}

/** Consecutive services sharing a category, as they fall on this page. */
function intoGroups(services: ServiceSummary[]) {
  const groups: { heading: string; services: ServiceSummary[] }[] = [];

  for (const service of services) {
    const heading = service.categoryName ?? "Other";
    const last = groups.at(-1);
    if (last?.heading === heading) last.services.push(service);
    else groups.push({ heading, services: [service] });
  }

  return groups;
}

export default async function ServicesPage({ searchParams }: PageProps<"/services">) {
  const organization = await getPublicOrganizationInfo();
  const servicesResult = await getPublicServices(organization?.id);
  const practiceName = organization?.name ?? "The Traveling Vet";
  const [content, sections] = await Promise.all([
    organization ? getPublicSiteContent(organization.id) : Promise.resolve({}),
    organization ? getPublicPageSectionItems(organization.id, "services") : Promise.resolve<PageSectionItems>({}),
  ]);
  const highlights = sections.highlights ?? [];

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Math.max(1, Number(pageParam) || 1) : 1;

  const services = servicesResult.status === "ok" ? [...servicesResult.data].sort(byCategoryThenOrder) : [];

  // A page past the end shows the last one rather than an empty grid.
  const totalPages = Math.max(1, Math.ceil(services.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const groups = intoGroups(services.slice(start, start + PAGE_SIZE));

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} logoUrl={organization?.logoUrl ?? null} organizationId={organization?.id ?? null} />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="bg-primary/15 pointer-events-none absolute top-[-10rem] left-1/2 size-[28rem] -translate-x-1/2 rounded-full blur-3xl"
          />
          <div className="relative mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Our services</h1>
            <p className="text-muted-foreground mt-6 text-lg text-balance">
              {siteContentValue(content, "services.intro", practiceName)}
            </p>
          </div>
        </section>

        {/* Admin-editable via /admin/website/sections/services — sits above the priced list. */}
        {highlights.length > 0 ? (
          <section className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6">
            <SectionCards items={highlights} variant="cards" columns={3} />
          </section>
        ) : null}

        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            {servicesResult.status === "error" ? (
              <ErrorState title="Services could not be loaded" />
            ) : services.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No services listed yet"
                description="Check back soon — our services will appear here once they're set up."
              />
            ) : (
              <div className="grid gap-10">
                {groups.map((group) => (
                  <div key={group.heading} className="grid gap-4">
                    <div className="flex items-baseline gap-3">
                      <h2 className="text-xl font-semibold tracking-tight">{group.heading}</h2>
                      <span className="text-muted-foreground text-sm tabular-nums">{group.services.length}</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {group.services.map((service) => (
                        <Card key={service.id} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                          <CardContent className="grid gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium">{service.name}</p>
                              {service.isHomeVisitAvailable ? (
                                <Badge variant="secondary">
                                  <Home aria-hidden />
                                  Home visit available
                                </Badge>
                              ) : null}
                            </div>
                            {service.description ? (
                              <p className="text-muted-foreground text-sm">{service.description}</p>
                            ) : null}
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="font-semibold" data-numeric>
                                {service.price}
                              </span>
                              <span className="text-muted-foreground text-sm">{service.durationMinutes} min</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}

                <Pagination
                  basePath="/services"
                  searchParams={{}}
                  page={currentPage}
                  pageSize={PAGE_SIZE}
                  totalCount={services.length}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}

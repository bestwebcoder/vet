import type { Metadata } from "next";
import { ClipboardList, Home } from "lucide-react";

import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { getPublicServices, type ServiceSummary } from "@/features/services/queries";
import { siteContentValue } from "@/features/site-content/fields";
import { getPublicSiteContent } from "@/features/site-content/queries";

export const metadata: Metadata = { title: "Services · TV Care" };

function groupByCategory(services: ServiceSummary[]) {
  const groups = new Map<string, ServiceSummary[]>();

  for (const service of services) {
    const key = service.categoryName ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(service);
  }

  return [...groups.entries()];
}

export default async function ServicesPage() {
  const [organization, servicesResult] = await Promise.all([getPublicOrganizationInfo(), getPublicServices()]);
  const practiceName = organization?.name ?? "The Traveling Vet";
  const content = organization ? await getPublicSiteContent(organization.id) : {};

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} logoUrl={organization?.logoUrl ?? null} />

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

        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            {servicesResult.status === "error" ? (
              <ErrorState title="Services could not be loaded" />
            ) : servicesResult.data.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No services listed yet"
                description="Check back soon — our services will appear here once they're set up."
              />
            ) : (
              <div className="grid gap-10">
                {groupByCategory(servicesResult.data).map(([category, services]) => (
                  <div key={category} className="grid gap-4">
                    <h2 className="text-xl font-semibold tracking-tight">{category}</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {services.map((service) => (
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
              </div>
            )}
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}

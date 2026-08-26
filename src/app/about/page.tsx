import type { Metadata } from "next";

import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { SectionCards } from "@/components/marketing/section-cards";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { getPublicPageSectionItems, type PageSectionItems } from "@/features/page-sections/queries";
import { siteContentValue } from "@/features/site-content/fields";
import { getPublicSiteContent } from "@/features/site-content/queries";

export const metadata: Metadata = { title: "About Us · TV Care" };

export default async function AboutPage() {
  const organization = await getPublicOrganizationInfo();
  const practiceName = organization?.name ?? "The Traveling Vet";
  const [content, sections] = await Promise.all([
    organization ? getPublicSiteContent(organization.id) : Promise.resolve({}),
    organization ? getPublicPageSectionItems(organization.id, "about") : Promise.resolve<PageSectionItems>({}),
  ]);
  const text = (key: string) => siteContentValue(content, key, practiceName);
  const values = sections.values ?? [];

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
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">About {practiceName}</h1>
            <p className="text-muted-foreground mt-6 text-lg text-balance">{text("about.intro")}</p>
          </div>
        </section>

        {/* Admin-editable via /admin/website/sections/about — nothing renders until there is something to show. */}
        {values.length > 0 ? (
          <section className="border-border/60 border-t bg-muted/40">
            <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
              <SectionCards items={values} variant="cards" columns={3} />
            </div>
          </section>
        ) : null}

        <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How we work</h2>
          <div className="text-muted-foreground mt-4 grid gap-4">
            {text("about.how_we_work")
              .split("\n\n")
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
